/** Admin Control Room — every function here requires ADMIN role. */
import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { parseSessionToken, hashPassword } from "./lib/auth";
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
    const chefs = await ctx.db.query("chefs").collect();
    const withDetail = await Promise.all(
      chefs.map(async (c) => {
        const drops = await ctx.db.query("drops").withIndex("by_chefId", (q) => q.eq("chefId", c._id)).collect();
        const credits = (await ctx.db.query("adminCredits").withIndex("by_chefId", (q) => q.eq("chefId", c._id)).collect()).sort(
          (a, b) => b._creationTime - a._creationTime,
        );
        return {
          ...c,
          totalDrops: drops.length,
          successfulDrops: drops.filter((d) => d.status === "SOLD_OUT").length,
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
