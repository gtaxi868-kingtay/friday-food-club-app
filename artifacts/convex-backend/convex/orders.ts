import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { createGuestToken, parseGuestToken, parseSessionToken } from "./lib/auth";
import { DEFAULT_MEMBER_DISCOUNT, DEFAULT_PLATFORM_FEE_RATE } from "./config";

function isFridayInTrinidad(): boolean {
  const day = new Date().toLocaleDateString("en-US", { timeZone: "America/Port_of_Spain", weekday: "long" });
  return day === "Friday";
}

function genPickupToken(): string {
  const rand = () => crypto.getRandomValues(new Uint8Array(6)).reduce((s, b) => s + b.toString(16).padStart(2, "0"), "");
  return `FFC-${rand().slice(0, 10).toUpperCase()}-${rand().slice(0, 6).toUpperCase()}`;
}

/** Issues a server-signed guest identity for anonymous mobile checkout.
 *  Client persists the returned token and passes it back as `guestToken`
 *  on subsequent placeOrder / listOrders calls — mirrors the old
 *  signed-cookie guest flow, since Convex mutations have no cookie jar. */
export const issueGuestToken = mutation({
  args: {},
  handler: async () => {
    const guestId = `anon_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
    const guestToken = await createGuestToken(guestId);
    return { guestId, guestToken };
  },
});

/**
 * Place a pre-order. Convex mutations execute as a single serializable
 * transaction against the document store (optimistic concurrency + retry
 * on conflict) — so the duplicate check, capacity check, and inventory
 * increment below are ATOMIC by construction. No hand-written CAS query
 * chain needed; this is HANDOVER.md Priority 2 solved structurally.
 */
export const place = mutation({
  args: {
    dropId: v.id("drops"),
    paymentMethod: v.union(v.literal("DIGITAL"), v.literal("CASH")),
    sessionToken: v.optional(v.string()),
    guestToken: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, { dropId, paymentMethod, sessionToken, guestToken, idempotencyKey }) => {
    const session = await parseSessionToken(sessionToken);
    const guestId = session ? null : await parseGuestToken(guestToken);
    if (!session && !guestId) {
      throw new ConvexError({ code: "NO_IDENTITY", message: "Missing session or guest token" });
    }

    // Idempotency: a retried submit with the same key returns the original
    // order instead of creating a second one (HANDOVER.md Priority 2).
    if (idempotencyKey) {
      const existing = await ctx.db
        .query("orders")
        .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", idempotencyKey))
        .unique();
      if (existing) return { order: existing, replay: true };
    }

    const drop = await ctx.db.get(dropId);
    if (!drop) throw new ConvexError({ code: "NOT_FOUND", message: "Drop not found" });
    if (drop.status === "SOLD_OUT") throw new ConvexError({ code: "SOLD_OUT", message: "This drop is SOLD OUT" });
    if (drop.status === "CANCELLED") throw new ConvexError({ code: "CANCELLED", message: "This drop has been cancelled" });
    if (drop.status === "EXPIRED") throw new ConvexError({ code: "EXPIRED", message: "This drop has expired" });

    if (drop.isSecret && !isFridayInTrinidad()) {
      throw new ConvexError({
        code: "NOT_FRIDAY",
        message: "Secret drops are only available on Fridays. Come back then — this one will be waiting for you.",
      });
    }

    let userDoc = null;
    if (session) userDoc = await ctx.db.get(session.userId);

    // Duplicate-order guard (per user or per guest identity)
    const identityField = session ? ("userId" as const) : null;
    const existingOrders = session
      ? await ctx.db.query("orders").withIndex("by_userId", (q) => q.eq("userId", session.userId)).collect()
      : await ctx.db
          .query("orders")
          .filter((q) => q.eq(q.field("userId"), guestId as any))
          .collect();
    const dup = existingOrders.find((o) => o.dropId === dropId && o.status !== "CANCELLED");
    if (dup) throw new ConvexError({ code: "DUPLICATE", message: "You already have an order for this drop", orderId: dup._id });

    if (drop.currentOrders >= drop.inventory) {
      throw new ConvexError({ code: "SOLD_OUT", message: "This drop is SOLD OUT — no plates remaining" });
    }

    const cfg = await ctx.db.query("config").withIndex("by_key", (q) => q.eq("key", "platform")).unique();
    const feeRate = cfg?.platformFeeRate ?? DEFAULT_PLATFORM_FEE_RATE;
    const discountRate = cfg?.memberDiscountRate ?? DEFAULT_MEMBER_DISCOUNT;

    let isMember = false;
    if (session) {
      const activeSub = await ctx.db
        .query("subscriptions")
        .withIndex("by_userId", (q) => q.eq("userId", session.userId))
        .filter((q) => q.eq(q.field("status"), "ACTIVE"))
        .first();
      isMember = activeSub !== null;
    }

    const newCount = drop.currentOrders + 1;
    const shouldSoldOut = newCount >= drop.inventory;
    const shouldUnlock = newCount >= drop.minOrders;
    const wasActive = drop.status === "ACTIVE";

    await ctx.db.patch(dropId, {
      currentOrders: newCount,
      status: shouldSoldOut ? "SOLD_OUT" : drop.status,
      chefEarnings:
        shouldUnlock && drop.chefEarnings === undefined
          ? Math.round(newCount * drop.price * (1 - feeRate) * 100) / 100
          : drop.chefEarnings,
    });

    const basePrice = drop.price;
    const effectivePrice = Math.round(basePrice * (1 - (isMember ? discountRate : 0)) * 100) / 100;

    const orderId = await ctx.db.insert("orders", {
      userId: (session ? session.userId : (guestId as any)) as any,
      dropId,
      chefId: drop.chefId,
      price: basePrice,
      effectivePrice,
      status: "PENDING",
      isMemberOrder: isMember,
      paymentMethod,
      escrowStatus: paymentMethod === "CASH" ? "CASH" : "PENDING_PAYMENT",
      pickupToken: genPickupToken(),
      idempotencyKey: idempotencyKey ?? `order_${crypto.randomUUID()}`,
    });

    const order = await ctx.db.get(orderId);
    return {
      order,
      justUnlocked: shouldUnlock && wasActive && !shouldSoldOut,
      justSoldOut: shouldSoldOut,
      remaining: Math.max(0, drop.inventory - newCount),
    };
  },
});

/** Reactive order list — replaces GET /api/orders. Auto-updates in every
 *  connected client when an order or its drop changes status. */
export const listMine = query({
  args: { sessionToken: v.optional(v.string()), guestToken: v.optional(v.string()) },
  handler: async (ctx, { sessionToken, guestToken }) => {
    const session = await parseSessionToken(sessionToken);
    const guestId = session ? null : await parseGuestToken(guestToken);
    if (!session && !guestId) return [];

    const orders = session
      ? await ctx.db.query("orders").withIndex("by_userId", (q) => q.eq("userId", session.userId)).collect()
      : await ctx.db.query("orders").filter((q) => q.eq(q.field("userId"), guestId as any)).collect();

    const withDrop = await Promise.all(
      orders.map(async (o) => {
        const drop = await ctx.db.get(o.dropId);
        const chef = drop ? await ctx.db.get(drop.chefId) : null;
        return {
          ...o,
          dropTitle: drop?.title ?? null,
          chefName: chef?.name ?? null,
          dropStatus: drop?.status ?? null,
          minOrders: drop?.minOrders ?? 0,
          currentOrders: drop?.currentOrders ?? 0,
          dropExpiresAt: drop?.expiresAt ?? null,
          pickupLocation: drop?.pickupLocation ?? null,
          pickupLat: drop?.pickupLat ?? null,
          pickupLng: drop?.pickupLng ?? null,
        };
      }),
    );
    return withDrop.sort((a, b) => b._creationTime - a._creationTime);
  },
});

export const cancel = mutation({
  args: { orderId: v.id("orders"), sessionToken: v.optional(v.string()), guestToken: v.optional(v.string()) },
  handler: async (ctx, { orderId, sessionToken, guestToken }) => {
    const session = await parseSessionToken(sessionToken);
    const guestId = session ? null : await parseGuestToken(guestToken);

    const order = await ctx.db.get(orderId);
    if (!order) throw new ConvexError({ code: "NOT_FOUND", message: "Order not found" });

    const isOwner = (session && order.userId === session.userId) || (!session && order.userId === (guestId as any));
    if (!isOwner && session?.role !== "ADMIN") {
      throw new ConvexError({ code: "FORBIDDEN", message: "Not authorized to cancel this order" });
    }
    if (order.status !== "PENDING") {
      throw new ConvexError({ code: "INVALID_STATE", message: "Order not found or already cancelled/confirmed" });
    }

    const drop = await ctx.db.get(order.dropId);
    await ctx.db.patch(orderId, {
      status: "CANCELLED",
      escrowStatus:
        order.escrowStatus === "HELD" ||
        order.escrowStatus === "PENDING_PAYMENT" ||
        order.escrowStatus === "PAYMENT_FAILED" ||
        order.escrowStatus === "CASH"
          ? "CANCELLED"
          : order.escrowStatus,
    });
    if (drop) {
      const newCount = Math.max(0, drop.currentOrders - 1);
      await ctx.db.patch(drop._id, {
        currentOrders: newCount,
        status: drop.status === "SOLD_OUT" && newCount < drop.inventory ? "ACTIVE" : drop.status,
      });
    }
    return { id: orderId, status: "CANCELLED" as const, dropId: order.dropId };
  },
});
