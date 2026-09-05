/** Admin Control Room — every function here requires ADMIN role. */
import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { parseSessionToken, hashPassword } from "./lib/auth";
import { DEFAULT_NO_SHOW_PENALTY } from "./config";
import type { QueryCtx, MutationCtx } from "./_generated/server";

async function requireAdmin(ctx: QueryCtx | MutationCtx, sessionToken: string) {
  const session = await parseSessionToken(sessionToken);
  if (session?.role !== "ADMIN") throw new ConvexError({ code: "FORBIDDEN", message: "Requires role: ADMIN" });
  return session;
}

export const stats = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    await requireAdmin(ctx, sessionToken);
    const [drops, chefs, users, subs] = await Promise.all([
      ctx.db.query("drops").collect(),
      ctx.db.query("chefs").collect(),
      ctx.db.query("users").collect(),
      ctx.db.query("subscriptions").collect(),
    ]);
    const orders = (await ctx.db.query("orders").collect()).filter((o) => o.status !== "CANCELLED");

    const byMealSlotMap = new Map<string, { count: number; revenue: number; soldOut: number }>();
    for (const d of drops) {
      const row = byMealSlotMap.get(d.mealSlot) ?? { count: 0, revenue: 0, soldOut: 0 };
      row.count += 1;
      if (d.status === "SOLD_OUT") row.soldOut += 1;
      byMealSlotMap.set(d.mealSlot, row);
    }
    for (const o of orders) {
      const drop = drops.find((d) => d._id === o.dropId);
      if (!drop) continue;
      const row = byMealSlotMap.get(drop.mealSlot);
      if (row) row.revenue += o.effectivePrice;
    }

    const now = Date.now();
    const activeSubs = subs.filter((s) => s.status === "ACTIVE" && s.expiresAt > now);

    // Repeat-buyer rate — the real signal on whether this is a durable
    // business or a one-time novelty, vs. the raw revenue totals above.
    const ordersPerBuyer = new Map<string, number>();
    for (const o of orders) ordersPerBuyer.set(o.userId, (ordersPerBuyer.get(o.userId) ?? 0) + 1);
    const totalBuyers = ordersPerBuyer.size;
    const repeatBuyers = [...ordersPerBuyer.values()].filter((n) => n > 1).length;
    const repeatBuyerRate = totalBuyers > 0 ? repeatBuyers / totalBuyers : 0;

    // No-show risk — orders still paid-and-held after their drop expired,
    // meaning nobody scanned a pickup. Flags chefs whose drops routinely
    // never get fulfilled, independent of whether they sold out.
    const unfulfilledExpired = orders.filter((o) => {
      if (o.status !== "PENDING" || !["HELD", "CASH"].includes(o.escrowStatus)) return false;
      const drop = drops.find((d) => d._id === o.dropId);
      return !!drop && drop.expiresAt < now;
    });

    const chefEarningsById = new Map<string, number>();
    for (const o of orders) chefEarningsById.set(o.chefId, (chefEarningsById.get(o.chefId) ?? 0) + (o.chefShare ?? 0));
    const topChefs = [...chefs]
      .filter((c) => drops.some((d) => d.chefId === c._id && ["SOLD_OUT"].includes(d.status)))
      .map((c) => ({
        id: c._id,
        name: c.name,
        handle: c.handle,
        rating: c.rating,
        successfulDrops: drops.filter((d) => d.chefId === c._id && d.status === "SOLD_OUT").length,
        totalEarnings: chefEarningsById.get(c._id) ?? 0,
      }))
      .sort((a, b) => b.totalEarnings - a.totalEarnings)
      .slice(0, 10);

    return {
      platform: {
        totalDrops: drops.length,
        activeDrops: drops.filter((d) => d.status === "ACTIVE").length,
        soldOutDrops: drops.filter((d) => d.status === "SOLD_OUT").length,
        totalOrders: orders.length,
        grossRevenue: orders.reduce((a, o) => a + o.effectivePrice, 0),
        platformRevenue: orders.reduce((a, o) => a + (o.platformShare ?? 0), 0),
        chefPayouts: orders.reduce((a, o) => a + (o.chefShare ?? 0), 0),
        totalChefs: chefs.length,
        verifiedChefs: chefs.filter((c) => c.isVerified).length,
        pendingChefs: chefs.filter((c) => !c.isVerified).length,
        totalUsers: users.length,
        subscriptions: {
          total: subs.length,
          active: activeSubs.length,
          monthlyRevenue: activeSubs.length * 5,
        },
        repeatBuyerRate,
        totalBuyers,
        unfulfilledExpiredOrders: unfulfilledExpired.length,
      },
      byMealSlot: [...byMealSlotMap.entries()].map(([mealSlot, v]) => ({ mealSlot, ...v })),
      topChefs,
      generatedAt: new Date().toISOString(),
    };
  },
});

export const listDrops = query({
  args: { sessionToken: v.string(), status: v.optional(v.string()), chefId: v.optional(v.id("chefs")) },
  handler: async (ctx, { sessionToken, status, chefId }) => {
    await requireAdmin(ctx, sessionToken);
    let drops = chefId
      ? await ctx.db.query("drops").withIndex("by_chefId", (q) => q.eq("chefId", chefId)).collect()
      : await ctx.db.query("drops").collect();
    if (status) drops = drops.filter((d) => d.status === status.toUpperCase());

    const withStats = await Promise.all(
      drops.map(async (d) => {
        const chef = await ctx.db.get(d.chefId);
        const orders = (await ctx.db.query("orders").withIndex("by_dropId", (q) => q.eq("dropId", d._id)).collect()).filter(
          (o) => o.status !== "CANCELLED",
        );
        return {
          ...d,
          remaining: Math.max(0, d.inventory - d.currentOrders),
          chefName: chef?.name ?? null,
          orderCount: orders.length,
          batchRevenue: orders.reduce((a, o) => a + o.effectivePrice, 0),
        };
      }),
    );
    return { drops: withStats.sort((a, b) => Number(!!b.isFeatured) - Number(!!a.isFeatured) || b.expiresAt - a.expiresAt), total: withStats.length };
  },
});

export const listChefs = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    await requireAdmin(ctx, sessionToken);
    const now = Date.now();
    const chefs = await ctx.db.query("chefs").collect();
    const withDetail = await Promise.all(
      chefs.map(async (c) => {
        const drops = await ctx.db.query("drops").withIndex("by_chefId", (q) => q.eq("chefId", c._id)).collect();
        const credits = (await ctx.db.query("adminCredits").withIndex("by_chefId", (q) => q.eq("chefId", c._id)).collect()).sort(
          (a, b) => b._creationTime - a._creationTime,
        );
        const orders = await ctx.db.query("orders").withIndex("by_chefId", (q) => q.eq("chefId", c._id)).collect();
        const unfulfilledExpiredOrders = orders.filter((o) => {
          if (o.status !== "PENDING" || !["HELD", "CASH"].includes(o.escrowStatus)) return false;
          const drop = drops.find((d) => d._id === o.dropId);
          return !!drop && drop.expiresAt < now;
        }).length;
        const cancelledDrops = drops.filter((d) => d.status === "CANCELLED").length;
        return {
          ...c,
          totalDrops: drops.length,
          successfulDrops: drops.filter((d) => d.status === "SOLD_OUT").length,
          cancelledDrops,
          cancellationRate: drops.length > 0 ? cancelledDrops / drops.length : 0,
          unfulfilledExpiredOrders,
          creditHistory: credits.map((cr) => ({ amount: cr.amount, note: cr.note, createdAt: cr._creationTime })),
        };
      }),
    );
    return {
      chefs: withDetail.sort((a, b) =>
        (a.verificationStatus === "PENDING_REVIEW" ? 0 : 1) - (b.verificationStatus === "PENDING_REVIEW" ? 0 : 1) || b.points - a.points,
      ),
      pendingVerification: chefs.filter((c) => c.verificationStatus === "PENDING_REVIEW").length,
    };
  },
});

export const verifyChef = mutation({
  args: { sessionToken: v.string(), chefId: v.id("chefs") },
  handler: async (ctx, { sessionToken, chefId }) => {
    await requireAdmin(ctx, sessionToken);
    const chef = await ctx.db.get(chefId);
    if (!chef) throw new ConvexError({ code: "NOT_FOUND", message: "Chef not found" });
    if (!chef.foodBadgeUploadId || !chef.nationalIdUploadId) {
      throw new ConvexError({ code: "MISSING_DOCS", message: "Cannot approve: chef has not submitted required documents." });
    }
    await ctx.db.patch(chefId, { isVerified: true, verificationStatus: "VERIFIED", rejectionReason: undefined });
    const user = await ctx.db.query("users").withIndex("by_chefId", (q) => q.eq("chefId", chefId)).first();
    if (user) await ctx.db.patch(user._id, { role: "CHEF" });
    return { id: chefId, isVerified: true, verificationStatus: "VERIFIED" as const };
  },
});

export const rejectChef = mutation({
  args: { sessionToken: v.string(), chefId: v.id("chefs"), reason: v.optional(v.string()) },
  handler: async (ctx, { sessionToken, chefId, reason }) => {
    await requireAdmin(ctx, sessionToken);
    const chef = await ctx.db.get(chefId);
    if (!chef) throw new ConvexError({ code: "NOT_FOUND", message: "Chef not found" });
    await ctx.db.patch(chefId, { isVerified: false, verificationStatus: "REJECTED", rejectionReason: reason });
    const user = await ctx.db.query("users").withIndex("by_chefId", (q) => q.eq("chefId", chefId)).first();
    if (user) await ctx.db.patch(user._id, { role: "BUYER" });
    return { id: chefId, isVerified: false, verificationStatus: "REJECTED" as const, reason: reason ?? null };
  },
});

export const setDropStatus = mutation({
  args: {
    sessionToken: v.string(),
    dropId: v.id("drops"),
    status: v.union(v.literal("ACTIVE"), v.literal("SOLD_OUT"), v.literal("EXPIRED"), v.literal("CANCELLED")),
  },
  handler: async (ctx, { sessionToken, dropId, status }) => {
    await requireAdmin(ctx, sessionToken);
    const drop = await ctx.db.get(dropId);
    if (!drop) throw new ConvexError({ code: "NOT_FOUND", message: "Drop not found" });
    await ctx.db.patch(dropId, { status });
    return { id: dropId, status };
  },
});

export const toggleFeatured = mutation({
  args: { sessionToken: v.string(), dropId: v.id("drops") },
  handler: async (ctx, { sessionToken, dropId }) => {
    await requireAdmin(ctx, sessionToken);
    const drop = await ctx.db.get(dropId);
    if (!drop) throw new ConvexError({ code: "NOT_FOUND", message: "Drop not found" });
    const isFeatured = !drop.isFeatured;
    await ctx.db.patch(dropId, { isFeatured });
    return { id: dropId, isFeatured };
  },
});

/**
 * Manual wallet credit. Convex mutations are transactional per call, so a
 * concurrent duplicate submit is naturally serialized — the idempotencyKey
 * unique-index lookup below replaces the old in-flight Map + TTL cache.
 */
export const creditChefWallet = mutation({
  args: { sessionToken: v.string(), chefId: v.id("chefs"), amount: v.number(), note: v.optional(v.string()), idempotencyKey: v.optional(v.string()) },
  handler: async (ctx, { sessionToken, chefId, amount, note, idempotencyKey }) => {
    await requireAdmin(ctx, sessionToken);
    if (amount <= 0) throw new ConvexError("amount must be positive");

    if (idempotencyKey) {
      const existing = await ctx.db.query("adminCredits").withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", idempotencyKey)).unique();
      if (existing) {
        const chef = await ctx.db.get(existing.chefId);
        return { success: true, chefId: existing.chefId, newWalletBalance: chef?.walletBalance ?? 0 };
      }
    }

    const chef = await ctx.db.get(chefId);
    if (!chef) throw new ConvexError({ code: "NOT_FOUND", message: "Chef not found" });
    const noteValue = note ?? "Admin manual credit";
    await ctx.db.insert("adminCredits", { chefId, amount, note: noteValue, idempotencyKey });
    const newBalance = chef.walletBalance + amount;
    await ctx.db.patch(chefId, { walletBalance: newBalance });
    return { success: true, chefId, newWalletBalance: newBalance };
  },
});

/** Manually onboard a verified chef, bypassing the application queue. */
export const addChef = mutation({
  args: {
    sessionToken: v.string(),
    name: v.string(),
    kitchenName: v.optional(v.string()),
    area: v.string(),
    email: v.string(),
    cuisine: v.optional(v.string()),
  },
  handler: async (ctx, { sessionToken, name, kitchenName, area, email, cuisine }) => {
    await requireAdmin(ctx, sessionToken);
    const normalizedEmail = email.toLowerCase();
    const existing = await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", normalizedEmail)).unique();
    if (existing) throw new ConvexError("An account with this email already exists");

    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    const tempPassword =
      Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("") + String(Math.floor(Math.random() * 9000) + 1000);
    const displayName = kitchenName ?? name;
    const handle = `@${displayName.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 24)}`;

    const chefId = await ctx.db.insert("chefs", {
      name: displayName,
      handle,
      cuisine: cuisine ?? "Caribbean",
      region: area,
      isVerified: true,
      verificationStatus: "VERIFIED",
      rating: 0,
      totalDrops: 0,
      successfulDrops: 0,
      points: 0,
      rank: 0,
      walletBalance: 0,
    });
    const userId = await ctx.db.insert("users", {
      name,
      email: normalizedEmail,
      passwordHash: await hashPassword(tempPassword),
      role: "CHEF",
      area,
      points: 0,
      walletBalance: 0,
      handle,
      chefId,
    });
    return { success: true, userId, chefId, email: normalizedEmail, handle, tempPassword };
  },
});

/** Expired drops still holding paid orders nobody ever picked up —
 *  the no-show risk queue. */
export const noShowDrops = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    await requireAdmin(ctx, sessionToken);
    const now = Date.now();
    const expiredDrops = (await ctx.db.query("drops").collect()).filter((d) => d.expiresAt < now && d.status !== "CANCELLED");

    const rows = await Promise.all(
      expiredDrops.map(async (d) => {
        const allOrders = await ctx.db.query("orders").withIndex("by_dropId", (q) => q.eq("dropId", d._id)).collect();
        const unfulfilled = allOrders.filter((o) => o.status === "PENDING" && ["HELD", "CASH"].includes(o.escrowStatus));
        if (unfulfilled.length === 0) return null;
        // Proof the chef actually showed up: at least one order on this same
        // drop got scanned and fulfilled. If so, the remaining no-shows are
        // on the buyers who never came — not the chef.
        const chefShowedUp = allOrders.some((o) => o.status === "FULFILLED");
        const chef = await ctx.db.get(d.chefId);
        return {
          dropId: d._id,
          dropTitle: d.title,
          chefId: d.chefId,
          chefName: chef?.name ?? null,
          expiresAt: d.expiresAt,
          unfulfilledOrders: unfulfilled.length,
          amountHeld: unfulfilled.reduce((a, o) => a + o.effectivePrice, 0),
          chefShowedUp,
        };
      }),
    );
    return rows.filter((r): r is NonNullable<typeof r> => r !== null).sort((a, b) => a.expiresAt - b.expiresAt);
  },
});

/** Resolve a no-show on an expired drop. Two opposite cases, told apart by
 *  whether ANY order on this drop was ever scanned/fulfilled:
 *    - Chef never showed at all → nobody could redeem anything. Refund
 *      every buyer and dock the chef's wallet.
 *    - Chef showed up (proven by at least one fulfilled order) but some
 *      buyers never came to collect → that's on the buyer, same as a
 *      restaurant no-show. Digital prepaid orders release to the chef as
 *      normal (they did the work); cash orders just close out — nothing
 *      was collected up front, so there's nothing to forfeit or refund. */
export const resolveNoShow = mutation({
  args: { sessionToken: v.string(), dropId: v.id("drops") },
  handler: async (ctx, { sessionToken, dropId }) => {
    await requireAdmin(ctx, sessionToken);
    const drop = await ctx.db.get(dropId);
    if (!drop) throw new ConvexError({ code: "NOT_FOUND", message: "Drop not found" });
    if (drop.expiresAt >= Date.now()) {
      throw new ConvexError({ code: "INVALID_STATE", message: "This drop hasn't expired yet" });
    }

    const allOrders = await ctx.db.query("orders").withIndex("by_dropId", (q) => q.eq("dropId", dropId)).collect();
    const unfulfilled = allOrders.filter((o) => o.status === "PENDING" && ["HELD", "CASH"].includes(o.escrowStatus));
    if (unfulfilled.length === 0) {
      return { dropId, mode: "none" as const, refundedOrders: 0, releasedOrders: 0, penalty: 0 };
    }
    const chefShowedUp = allOrders.some((o) => o.status === "FULFILLED");

    if (drop.status !== "CANCELLED" && drop.status !== "EXPIRED") {
      await ctx.db.patch(dropId, { status: "EXPIRED" });
    }

    if (!chefShowedUp) {
      // Chef no-show: refund everyone, penalize the chef.
      for (const o of unfulfilled) {
        await ctx.db.patch(o._id, { status: "CANCELLED", escrowStatus: "REFUNDED" });
      }
      const cfg = await ctx.db.query("config").withIndex("by_key", (q) => q.eq("key", "platform")).unique();
      const penaltyPerOrder = cfg?.noShowPenalty ?? DEFAULT_NO_SHOW_PENALTY;
      const penalty = penaltyPerOrder * unfulfilled.length;

      const chef = await ctx.db.get(drop.chefId);
      if (chef) {
        await ctx.db.patch(chef._id, { walletBalance: chef.walletBalance - penalty });
        await ctx.db.insert("adminCredits", {
          chefId: chef._id,
          amount: -penalty,
          note: `No-show penalty: "${drop.title}" (${unfulfilled.length} unfulfilled order${unfulfilled.length === 1 ? "" : "s"})`,
        });
      }
      return { dropId, mode: "chef_no_show" as const, refundedOrders: unfulfilled.length, releasedOrders: 0, penalty };
    }

    // Buyer no-show(s): chef proved up. Digital prepaid orders forfeit to
    // the chef (same payout math as a normal scan); cash orders just close,
    // since nothing was ever collected.
    const cfg = await ctx.db.query("config").withIndex("by_key", (q) => q.eq("key", "platform")).unique();
    const feeRate = cfg?.platformFeeRate ?? 0.1;
    const chef = await ctx.db.get(drop.chefId);
    let releasedOrders = 0;
    let walletBalance = chef?.walletBalance ?? 0;

    for (const o of unfulfilled) {
      if (o.paymentMethod === "DIGITAL" && o.escrowStatus === "HELD") {
        const gross = o.effectivePrice;
        const platformShare = Math.round(gross * feeRate * 100) / 100;
        const chefShare = Math.round((gross - platformShare) * 100) / 100;
        walletBalance += chefShare;
        await ctx.db.patch(o._id, {
          status: "CANCELLED",
          escrowStatus: "RELEASED",
          chefShare,
          platformShare,
          fulfilledAt: Date.now(),
        });
        releasedOrders += 1;
      } else {
        // CASH orders never collected anything up front — just close them.
        await ctx.db.patch(o._id, { status: "CANCELLED", escrowStatus: "CANCELLED" });
      }
    }
    if (chef && walletBalance !== chef.walletBalance) {
      await ctx.db.patch(chef._id, { walletBalance });
    }

    return { dropId, mode: "buyer_no_show" as const, refundedOrders: 0, releasedOrders, penalty: 0 };
  },
});

/** Region breakdown — active verified chefs + live drops per area. */
export const coverage = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    await requireAdmin(ctx, sessionToken);
    const chefs = (await ctx.db.query("chefs").collect()).filter((c) => c.isVerified);
    const now = Date.now();
    const byRegion = new Map<string, { activeChefs: number; liveDrops: number }>();
    for (const c of chefs) {
      const region = c.region?.trim() || "Unknown";
      const row = byRegion.get(region) ?? { activeChefs: 0, liveDrops: 0 };
      row.activeChefs += 1;
      const drops = await ctx.db.query("drops").withIndex("by_chefId", (q) => q.eq("chefId", c._id)).collect();
      row.liveDrops += drops.filter((d) => d.status === "ACTIVE" && d.expiresAt > now).length;
      byRegion.set(region, row);
    }
    return {
      regions: [...byRegion.entries()]
        .map(([region, v]) => ({ region, ...v }))
        .sort((a, b) => b.activeChefs - a.activeChefs || b.liveDrops - a.liveDrops),
      generatedAt: new Date().toISOString(),
    };
  },
});
