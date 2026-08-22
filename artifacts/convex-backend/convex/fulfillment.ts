/**
 * Escrow & QR fulfillment — chef scans buyer's pickup token, escrow releases:
 *   chef wallet  += effectivePrice * (1 - platformFee)
 *   platform     += effectivePrice * platformFee
 * CASH orders: chef already collected the cash, so the platform fee is
 * DEBITED from the chef wallet instead (may go negative — see wallet.isFrozen).
 */
import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { parseSessionToken, requireVerifiedChef } from "./lib/auth";
import { DEFAULT_WALLET_FREEZE_THRESHOLD } from "./config";

export const verify = mutation({
  args: { sessionToken: v.string(), pickupToken: v.string(), chefId: v.optional(v.id("chefs")) },
  handler: async (ctx, { sessionToken, pickupToken, chefId: overrideChefId }) => {
    const session = await parseSessionToken(sessionToken);
    if (!session) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Not authenticated" });
    await requireVerifiedChef(ctx, session);

    let chefId = overrideChefId ?? null;
    if (session.role !== "ADMIN" || !chefId) {
      const user = await ctx.db.get(session.userId);
      chefId = user?.chefId ?? null;
    }
    if (!chefId) throw new ConvexError({ code: "FORBIDDEN", message: "No chef profile linked to this account" });

    const order = await ctx.db.query("orders").withIndex("by_pickupToken", (q) => q.eq("pickupToken", pickupToken)).unique();
    if (!order || order.chefId !== chefId || order.status !== "PENDING" || !["HELD", "CASH"].includes(order.escrowStatus)) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Invalid token, already fulfilled, or this order is not for your drop" });
    }

    const drop = await ctx.db.get(order.dropId);
    const cfg = await ctx.db.query("config").withIndex("by_key", (q) => q.eq("key", "platform")).unique();
    const feeRate = cfg?.platformFeeRate ?? 0.1;
    const chef = await ctx.db.get(chefId);
    if (!chef) throw new ConvexError({ code: "NOT_FOUND", message: "Chef not found" });

    const gross = order.effectivePrice;
    const platformShare = Math.round(gross * feeRate * 100) / 100;
    const chefShare = Math.round((gross - platformShare) * 100) / 100;
    const isCash = order.paymentMethod === "CASH";

    const newWalletBalance = isCash ? chef.walletBalance - platformShare : chef.walletBalance + chefShare;

    await ctx.db.patch(order._id, {
      status: "FULFILLED",
      escrowStatus: isCash ? "CASH_RECONCILED" : "RELEASED",
      fulfilledAt: Date.now(),
      chefShare: isCash ? gross - platformShare : chefShare,
      platformShare,
      cashCollected: isCash ? gross : undefined,
    });
    await ctx.db.patch(chefId, { walletBalance: newWalletBalance });

    return {
      orderId: order._id,
      dropId: order.dropId,
      dropTitle: drop?.title ?? null,
      paymentMethod: order.paymentMethod,
      gross,
      chefShare: isCash ? gross - platformShare : chefShare,
      platformShare,
      chefWalletBalance: newWalletBalance,
      cashCollected: isCash ? gross : null,
      status: "FULFILLED" as const,
    };
  },
});

/** Admin escrow ledger overview — reactive, replaces GET /api/fulfillment/ledger. */
export const ledger = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const session = await parseSessionToken(sessionToken);
    if (session?.role !== "ADMIN") throw new ConvexError({ code: "FORBIDDEN", message: "Requires role: ADMIN" });

    const orders = (await ctx.db.query("orders").collect()).filter(
      (o) => o.escrowStatus !== "CANCELLED" && o.status !== "CANCELLED",
    );

    const sum = (pred: (o: (typeof orders)[number]) => boolean, pick: (o: (typeof orders)[number]) => number) =>
      orders.filter(pred).reduce((acc, o) => acc + pick(o), 0);
    const count = (pred: (o: (typeof orders)[number]) => boolean) => orders.filter(pred).length;

    const heldInEscrow = sum((o) => o.escrowStatus === "HELD", (o) => o.effectivePrice);
    const totalDigitalChefPayouts = sum((o) => o.escrowStatus === "RELEASED", (o) => o.chefShare ?? 0);
    const totalDigitalPlatformRevenue = sum((o) => o.escrowStatus === "RELEASED", (o) => o.platformShare ?? 0);
    const ordersInEscrow = count((o) => o.escrowStatus === "HELD");
    const ordersDigitalFulfilled = count((o) => o.escrowStatus === "RELEASED");
    const cashOrdersHeld = sum((o) => o.escrowStatus === "CASH", (o) => o.effectivePrice);
    const totalCashCollected = sum((o) => o.escrowStatus === "CASH_RECONCILED", (o) => o.cashCollected ?? 0);
    const totalCashPlatformRevenue = sum((o) => o.escrowStatus === "CASH_RECONCILED", (o) => o.platformShare ?? 0);
    const cashOrdersPending = count((o) => o.escrowStatus === "CASH");
    const cashOrdersFulfilled = count((o) => o.escrowStatus === "CASH_RECONCILED");

    return {
      heldInEscrow,
      totalChefPayouts: totalDigitalChefPayouts,
      totalPlatformRevenue: totalDigitalPlatformRevenue + totalCashPlatformRevenue,
      ordersInEscrow,
      ordersFulfilled: ordersDigitalFulfilled,
      cash: {
        ordersAwaitingPickup: cashOrdersPending,
        ordersFulfilled: cashOrdersFulfilled,
        totalCashCollected,
        totalPlatformFees: totalCashPlatformRevenue,
        cashOrdersHeld,
      },
      digital: {
        ordersInEscrow,
        ordersFulfilled: ordersDigitalFulfilled,
        totalChefPayouts: totalDigitalChefPayouts,
        totalPlatformRevenue: totalDigitalPlatformRevenue,
      },
    };
  },
});

/** Chef wallet + last-25 transactions — reactive, replaces GET /api/fulfillment/wallet/:chefId. */
export const wallet = query({
  args: { sessionToken: v.string(), chefId: v.id("chefs") },
  handler: async (ctx, { sessionToken, chefId }) => {
    const session = await parseSessionToken(sessionToken);
    if (!session) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Not authenticated" });
    await requireVerifiedChef(ctx, session);
    if (session.role !== "ADMIN") {
      const user = await ctx.db.get(session.userId);
      if (user?.chefId !== chefId) throw new ConvexError({ code: "FORBIDDEN", message: "Not authorized to view this wallet" });
    }

    const chef = await ctx.db.get(chefId);
    if (!chef) throw new ConvexError({ code: "NOT_FOUND", message: "Chef not found" });
    const cfg = await ctx.db.query("config").withIndex("by_key", (q) => q.eq("key", "platform")).unique();
    const freezeThreshold = cfg?.walletFreezeThreshold ?? DEFAULT_WALLET_FREEZE_THRESHOLD;

    const fulfilled = (await ctx.db.query("orders").withIndex("by_chefId", (q) => q.eq("chefId", chefId)).collect()).filter(
      (o) => o.escrowStatus === "RELEASED" || o.escrowStatus === "CASH_RECONCILED",
    );

    const totalEarnings = fulfilled.reduce((acc, o) => acc + (o.chefShare ?? 0), 0);
    const recent = [...fulfilled]
      .sort((a, b) => (b.fulfilledAt ?? 0) - (a.fulfilledAt ?? 0))
      .slice(0, 25);

    const transactions = await Promise.all(
      recent.map(async (o) => {
        const drop = await ctx.db.get(o.dropId);
        return {
          orderId: o._id,
          dropTitle: drop?.title ?? null,
          paymentMethod: o.paymentMethod,
          chefShare: o.chefShare ?? 0,
          platformShare: o.platformShare ?? 0,
          cashCollected: o.cashCollected ?? null,
          fulfilledAt: o.fulfilledAt ?? null,
          walletEffect: o.paymentMethod === "CASH" ? -(o.platformShare ?? 0) : (o.chefShare ?? 0),
        };
      }),
    );

    return {
      walletBalance: chef.walletBalance,
      freezeThreshold,
      isFrozen: chef.walletBalance < freezeThreshold,
      cashDebt: chef.walletBalance < 0 ? Math.abs(chef.walletBalance) : 0,
      totalEarnings,
      recentPayouts: transactions,
      recentTransactions: transactions,
    };
  },
});
