import { action, internalMutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v, ConvexError } from "convex/values";
import { parseSessionToken } from "./lib/auth";

declare const process: { env: Record<string, string | undefined> };

const WIPAY_API_URL = "WIPAY_API_URL";
const WIPAY_MERCHANT_ID = "WIPAY_MERCHANT_ID";
const WIPAY_RETURN_URL = "WIPAY_RETURN_URL";

function requireConfig(name: string): string {
  const value = process.env[name];
  if (!value) throw new ConvexError({ code: "PAYMENT_NOT_CONFIGURED", message: `Missing Convex environment variable ${name}` });
  return value;
}

function safeReference(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 160 ? trimmed : undefined;
}

/**
 * Creates a provider transaction and asks the configured WiPay adapter for a
 * hosted checkout URL. The adapter endpoint is deliberately configured rather
 * than hardcoded: WiPay merchant accounts can expose different sandbox/live
 * URLs and credentials, and shipping a guessed endpoint would be unsafe.
 */
export const startOrderCheckout = action({
  args: { orderId: v.id("orders"), sessionToken: v.string() },
  handler: async (ctx, args): Promise<{ paymentId: string; checkoutUrl: string }> => {
    const prepared = await ctx.runMutation(internal.payments.prepareOrder, args);
    const apiUrl = requireConfig(WIPAY_API_URL);
    const merchantId = requireConfig(WIPAY_MERCHANT_ID);
    const returnUrl = requireConfig(WIPAY_RETURN_URL);
    const apiKey = requireConfig("WIPAY_API_KEY");

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        merchantId,
        reference: prepared.reference,
        amount: prepared.amount.toFixed(2),
        currency: "TTD",
        returnUrl,
        webhookReference: prepared.paymentId,
      }),
    });

    const body = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok) {
      await ctx.runMutation(internal.payments.markFailed, {
        paymentId: prepared.paymentId,
        rawStatus: `HTTP_${response.status}`,
      });
      throw new ConvexError({ code: "PAYMENT_PROVIDER_ERROR", message: "WiPay could not create checkout" });
    }

    const checkoutUrl = safeReference(body?.checkoutUrl ?? body?.redirectUrl ?? body?.url);
    const providerReference = safeReference(body?.transactionId ?? body?.reference ?? body?.id);
    if (!checkoutUrl) {
      await ctx.runMutation(internal.payments.markFailed, {
        paymentId: prepared.paymentId,
        rawStatus: "MISSING_CHECKOUT_URL",
      });
      throw new ConvexError({ code: "PAYMENT_PROVIDER_ERROR", message: "WiPay response did not include a checkout URL" });
    }

    await ctx.runMutation(internal.payments.markPending, {
      paymentId: prepared.paymentId,
      checkoutUrl,
      providerReference,
    });
    return { paymentId: prepared.paymentId, checkoutUrl };
  },
});

export const startClubPassCheckout = action({
  args: { sessionToken: v.string() },
  handler: async (ctx, args): Promise<{ paymentId: string; checkoutUrl: string }> => {
    const prepared = await ctx.runMutation(internal.payments.prepareClubPass, args);
    const apiUrl = requireConfig(WIPAY_API_URL);
    const merchantId = requireConfig(WIPAY_MERCHANT_ID);
    const returnUrl = requireConfig(WIPAY_RETURN_URL);
    const apiKey = requireConfig("WIPAY_API_KEY");

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        merchantId,
        reference: prepared.reference,
        amount: prepared.amount.toFixed(2),
        currency: "TTD",
        returnUrl,
        webhookReference: prepared.paymentId,
        description: "Friday Food Club Club Pass",
      }),
    });
    const body = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok) {
      await ctx.runMutation(internal.payments.markFailed, { paymentId: prepared.paymentId, rawStatus: `HTTP_${response.status}` });
      throw new ConvexError({ code: "PAYMENT_PROVIDER_ERROR", message: "WiPay could not create checkout" });
    }
    const checkoutUrl = safeReference(body?.checkoutUrl ?? body?.redirectUrl ?? body?.url);
    const providerReference = safeReference(body?.transactionId ?? body?.reference ?? body?.id);
    if (!checkoutUrl) {
      await ctx.runMutation(internal.payments.markFailed, { paymentId: prepared.paymentId, rawStatus: "MISSING_CHECKOUT_URL" });
      throw new ConvexError({ code: "PAYMENT_PROVIDER_ERROR", message: "WiPay response did not include a checkout URL" });
    }
    await ctx.runMutation(internal.payments.markPending, { paymentId: prepared.paymentId, checkoutUrl, providerReference });
    return { paymentId: prepared.paymentId, checkoutUrl };
  },
});

export const getForOrder = query({
  args: { orderId: v.id("orders"), sessionToken: v.string() },
  handler: async (ctx, { orderId, sessionToken }) => {
    const session = await parseSessionToken(sessionToken);
    if (!session) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Not authenticated" });
    const order = await ctx.db.get(orderId);
    if (!order || (session.role !== "ADMIN" && order.userId !== session.userId)) {
      throw new ConvexError({ code: "FORBIDDEN", message: "Not authorized to view this payment" });
    }
    return (await ctx.db.query("paymentTransactions").withIndex("by_orderId", (q) => q.eq("orderId", orderId)).collect())
      .sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
  },
});

export const prepareOrder = internalMutation({
  args: { orderId: v.id("orders"), sessionToken: v.string() },
  handler: async (ctx, { orderId, sessionToken }) => {
    const session = await parseSessionToken(sessionToken);
    if (!session) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Not authenticated" });
    const order = await ctx.db.get(orderId);
    if (!order || (session.role !== "ADMIN" && order.userId !== session.userId)) {
      throw new ConvexError({ code: "FORBIDDEN", message: "Not authorized to pay for this order" });
    }
    if (order.paymentMethod !== "DIGITAL") throw new ConvexError({ code: "INVALID_PAYMENT_METHOD", message: "Cash orders do not need online payment" });
    if (order.status !== "PENDING") throw new ConvexError({ code: "INVALID_STATE", message: "This order is no longer awaiting payment" });
    const existing = (await ctx.db.query("paymentTransactions").withIndex("by_orderId", (q) => q.eq("orderId", orderId)).collect())
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    if (existing && existing.status !== "REFUNDED" && existing.status !== "PAID") {
      if (existing.status === "FAILED") {
        await ctx.db.patch(existing._id, {
          status: "INITIATED",
          checkoutUrl: undefined,
          providerReference: undefined,
          rawStatus: undefined,
          updatedAt: Date.now(),
        });
      }
      return { paymentId: existing._id, reference: existing.idempotencyKey, amount: existing.amount };
    }
    const now = Date.now();
    const idempotencyKey = `order_payment_${orderId}`;
    const paymentId = await ctx.db.insert("paymentTransactions", {
      kind: "ORDER",
      orderId,
      userId: order.userId,
      provider: "WIPAY",
      amount: order.effectivePrice,
      currency: "TTD",
      status: "INITIATED",
      idempotencyKey,
      createdAt: now,
      updatedAt: now,
    });
    return { paymentId, reference: idempotencyKey, amount: order.effectivePrice };
  },
});

export const prepareClubPass = internalMutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const session = await parseSessionToken(sessionToken);
    if (!session) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Not authenticated" });
    const existingSubscription = (await ctx.db.query("subscriptions").withIndex("by_userId", (q) => q.eq("userId", session.userId)).collect())
      .find((subscription) => subscription.status === "ACTIVE" || subscription.status === "PENDING_PAYMENT");
    if (existingSubscription?.status === "ACTIVE") throw new ConvexError({ code: "CONFLICT", message: "Club Pass is already active" });

    const now = Date.now();
    const subscriptionId = existingSubscription?._id ?? await ctx.db.insert("subscriptions", {
      userId: session.userId,
      tier: "CLUB_PASS",
      status: "PENDING_PAYMENT",
      price: 0,
      startedAt: now,
      expiresAt: now,
    });
    const subscription = await ctx.db.get(subscriptionId);
    if (!subscription) throw new ConvexError({ code: "NOT_FOUND", message: "Subscription could not be created" });
    const existingPayment = subscription.paymentId ? await ctx.db.get(subscription.paymentId) : null;
    if (existingPayment && existingPayment.status !== "REFUNDED" && existingPayment.status !== "PAID") {
      if (existingPayment.status === "FAILED") {
        await ctx.db.patch(existingPayment._id, {
          status: "INITIATED",
          checkoutUrl: undefined,
          providerReference: undefined,
          rawStatus: undefined,
          updatedAt: Date.now(),
        });
      }
      return { paymentId: existingPayment._id, reference: existingPayment.idempotencyKey, amount: existingPayment.amount };
    }
    const config = await ctx.db.query("config").withIndex("by_key", (q) => q.eq("key", "platform")).unique();
    const amount = config?.clubPassPrice ?? 5;
    const idempotencyKey = `club_pass_${subscriptionId}`;
    const paymentId = await ctx.db.insert("paymentTransactions", {
      kind: "CLUB_PASS",
      subscriptionId,
      userId: session.userId,
      provider: "WIPAY",
      amount,
      currency: "TTD",
      status: "INITIATED",
      idempotencyKey,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(subscriptionId, { price: amount, paymentId });
    return { paymentId, reference: idempotencyKey, amount };
  },
});

export const markPending = internalMutation({
  args: { paymentId: v.id("paymentTransactions"), checkoutUrl: v.string(), providerReference: v.optional(v.string()) },
  handler: async (ctx, { paymentId, checkoutUrl, providerReference }) => {
    await ctx.db.patch(paymentId, { status: "PENDING", checkoutUrl, providerReference, updatedAt: Date.now() });
  },
});

export const markFailed = internalMutation({
  args: { paymentId: v.id("paymentTransactions"), rawStatus: v.string() },
  handler: async (ctx, { paymentId, rawStatus }) => {
    const payment = await ctx.db.get(paymentId);
    if (!payment || payment.status === "PAID" || payment.status === "REFUNDED") return;
    await ctx.db.patch(paymentId, { status: "FAILED", rawStatus, updatedAt: Date.now() });
    if (payment.orderId) await ctx.db.patch(payment.orderId, { escrowStatus: "PAYMENT_FAILED" });
  },
});

/** Apply a provider notification after http.ts has verified its HMAC. */
export const applyWebhook = internalMutation({
  args: {
    paymentReference: v.string(),
    providerReference: v.optional(v.string()),
    providerStatus: v.string(),
  },
  handler: async (ctx, { paymentReference, providerReference, providerStatus }) => {
    let payment = await ctx.db
      .query("paymentTransactions")
      .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", paymentReference))
      .unique();
    if (!payment && providerReference) {
      payment = await ctx.db
        .query("paymentTransactions")
        .withIndex("by_providerReference", (q) => q.eq("providerReference", providerReference))
        .unique();
    }
    if (!payment) {
      const possiblePayment = await ctx.db.get(paymentReference as any);
      if (
        possiblePayment &&
        "amount" in possiblePayment &&
        "idempotencyKey" in possiblePayment &&
        "provider" in possiblePayment
      ) {
        payment = possiblePayment as unknown as NonNullable<typeof payment>;
      }
    }
    if (!payment) throw new ConvexError({ code: "NOT_FOUND", message: "Payment transaction not found" });
    const normalized = providerStatus.toUpperCase();
    const paid = ["PAID", "SUCCESS", "COMPLETED", "APPROVED"].includes(normalized);
    const failed = ["FAILED", "DECLINED", "CANCELLED", "EXPIRED"].includes(normalized);
    const now = Date.now();
    if (payment.status === "PAID" || payment.status === "REFUNDED") return payment;

    if (paid) {
      await ctx.db.patch(payment._id, { status: "PAID", providerReference, rawStatus: providerStatus, updatedAt: now });
      if (payment.orderId) {
        const order = await ctx.db.get(payment.orderId);
        if (order?.status === "PENDING" && order.paymentMethod === "DIGITAL") {
          await ctx.db.patch(payment.orderId, { escrowStatus: "HELD" });
        } else if (order?.status === "CANCELLED") {
          await ctx.db.patch(payment._id, { refundRequired: true });
        }
      }
      if (payment.subscriptionId) {
        const subscription = await ctx.db.get(payment.subscriptionId);
        if (subscription?.status === "PENDING_PAYMENT") {
          await ctx.db.patch(payment.subscriptionId, {
            status: "ACTIVE",
            startedAt: now,
            expiresAt: now + 30 * 24 * 3_600_000,
          });
        }
      }
    } else if (failed) {
      await ctx.db.patch(payment._id, { status: "FAILED", providerReference, rawStatus: providerStatus, updatedAt: now });
      if (payment.orderId) await ctx.db.patch(payment.orderId, { escrowStatus: "PAYMENT_FAILED" });
      if (payment.subscriptionId) await ctx.db.patch(payment.subscriptionId, { status: "CANCELLED", cancelledAt: now });
    } else {
      await ctx.db.patch(payment._id, { status: "PENDING", providerReference, rawStatus: providerStatus, updatedAt: now });
    }
    return await ctx.db.get(payment._id);
  },
});