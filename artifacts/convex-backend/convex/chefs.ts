import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { parseSessionToken } from "./lib/auth";
import { DEFAULT_WALLET_FREEZE_THRESHOLD } from "./config";
import type { Id } from "./_generated/dataModel";

export const list = query({
  args: { verifiedOnly: v.optional(v.boolean()) },
  handler: async (ctx, { verifiedOnly }) => {
    const chefs = verifiedOnly
      ? await ctx.db.query("chefs").withIndex("by_verified", (q) => q.eq("isVerified", true)).collect()
      : await ctx.db.query("chefs").collect();
    return chefs.sort((a, b) => a.rank - b.rank);
  },
});

export const get = query({
  args: { chefId: v.id("chefs") },
  handler: async (ctx, { chefId }) => ctx.db.get(chefId),
});

/** Chef + their drops in one reactive query — replaces the two-hop
 *  (:Chef)-[:POSTED]->(:Drop) Cypher join used by GET /api/chefs/:id. */
export const getWithDrops = query({
  args: { chefId: v.id("chefs") },
  handler: async (ctx, { chefId }) => {
    const chef = await ctx.db.get(chefId);
    if (!chef) return null;
    const drops = await ctx.db.query("drops").withIndex("by_chefId", (q) => q.eq("chefId", chefId)).collect();
    // The stored totalDrops/successfulDrops only get set at chef creation
    // (always 0) and are never incremented as real drops resolve — compute
    // live from the drops themselves instead, so the profile's success rate
    // reflects reality for every chef, not just hand-seeded ones.
    return {
      ...chef,
      totalDrops: drops.length,
      successfulDrops: drops.filter((d) => d.status === "SOLD_OUT").length,
      cancelledDrops: drops.filter((d) => d.status === "CANCELLED").length,
      drops,
    };
  },
});

/** Public — a chef's full drop history, newest first. */
export const drops = query({
  args: { chefId: v.id("chefs"), limit: v.optional(v.number()) },
  handler: async (ctx, { chefId, limit }) => {
    const now = Date.now();
    const rows = await ctx.db.query("drops").withIndex("by_chefId", (q) => q.eq("chefId", chefId)).collect();
    return rows
      .sort((a, b) => b._creationTime - a._creationTime)
      .slice(0, Math.min(limit ?? 30, 50))
      .map((d) => ({
        ...d,
        remaining: Math.max(0, d.inventory - d.currentOrders),
        isFeatured: !!d.isFeatured && (d.featuredUntil === undefined || d.featuredUntil > now),
      }));
  },
});

export const myStatus = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const session = await parseSessionToken(sessionToken);
    if (!session) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Not authenticated" });
    const user = await ctx.db.get(session.userId);
    if (!user) throw new ConvexError({ code: "NOT_FOUND", message: "User not found" });
    const chef = user.chefId ? await ctx.db.get(user.chefId) : null;
    return {
      role: user.role,
      chefId: chef?._id ?? null,
      chefName: chef?.name ?? null,
      verificationStatus: chef?.verificationStatus ?? null,
      isVerified: chef?.isVerified ?? false,
      rejectionReason: chef?.rejectionReason ?? null,
      submittedAt: chef?.submittedAt ?? null,
    };
  },
});

export const myWallet = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const session = await parseSessionToken(sessionToken);
    if (!session || (session.role !== "CHEF" && session.role !== "ADMIN")) {
      throw new ConvexError({ code: "FORBIDDEN", message: "Requires role: CHEF or ADMIN" });
    }
    const user = await ctx.db.get(session.userId);
    if (!user?.chefId) throw new ConvexError({ code: "NOT_FOUND", message: "No chef profile linked to this account" });
    const chef = await ctx.db.get(user.chefId);
    if (!chef) throw new ConvexError({ code: "NOT_FOUND", message: "No chef profile linked to this account" });

    const cfg = await ctx.db.query("config").withIndex("by_key", (q) => q.eq("key", "platform")).unique();
    const threshold = cfg?.walletFreezeThreshold ?? DEFAULT_WALLET_FREEZE_THRESHOLD;

    const fulfilled = (await ctx.db.query("orders").withIndex("by_chefId", (q) => q.eq("chefId", chef._id)).collect()).filter(
      (o) => o.escrowStatus === "RELEASED" || o.escrowStatus === "CASH_RECONCILED",
    );
    const totalEarnings = fulfilled.reduce((a, o) => a + (o.chefShare ?? 0), 0);

    const credits = (await ctx.db.query("adminCredits").withIndex("by_chefId", (q) => q.eq("chefId", chef._id)).collect()).sort(
      (a, b) => b._creationTime - a._creationTime,
    );

    return {
      chefId: chef._id,
      walletBalance: chef.walletBalance,
      freezeThreshold: threshold,
      isFrozen: chef.walletBalance < threshold,
      cashDebt: Math.max(0, -chef.walletBalance),
      totalEarnings,
      creditHistory: credits.map((c) => ({ id: c._id, amount: c.amount, note: c.note, createdAt: c._creationTime })),
    };
  },
});

export const myEarnings = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const session = await parseSessionToken(sessionToken);
    if (!session || (session.role !== "CHEF" && session.role !== "ADMIN")) {
      throw new ConvexError({ code: "FORBIDDEN", message: "Requires role: CHEF or ADMIN" });
    }
    const user = await ctx.db.get(session.userId);
    if (!user?.chefId) throw new ConvexError({ code: "NOT_FOUND", message: "No chef profile linked to this account" });
    const chef = await ctx.db.get(user.chefId);
    if (!chef) throw new ConvexError({ code: "NOT_FOUND", message: "No chef profile linked to this account" });

    const cfg = await ctx.db.query("config").withIndex("by_key", (q) => q.eq("key", "platform")).unique();
    const threshold = cfg?.walletFreezeThreshold ?? DEFAULT_WALLET_FREEZE_THRESHOLD;

    const fulfilled = (await ctx.db.query("orders").withIndex("by_chefId", (q) => q.eq("chefId", chef._id)).collect()).filter(
      (o) => o.escrowStatus === "RELEASED" || o.escrowStatus === "CASH_RECONCILED",
    );
    const byDrop = new Map<Id<"drops">, { chefEarnings: number; orders: number; lastFulfilledAt: number | null }>();
    for (const o of fulfilled) {
      const row = byDrop.get(o.dropId) ?? { chefEarnings: 0, orders: 0, lastFulfilledAt: null };
      row.chefEarnings += o.chefShare ?? 0;
      row.orders += 1;
      row.lastFulfilledAt = Math.max(row.lastFulfilledAt ?? 0, o.fulfilledAt ?? 0);
      byDrop.set(o.dropId, row);
    }
    const drops = await Promise.all(
      [...byDrop.entries()].map(async ([dropId, row]) => {
        const drop = await ctx.db.get(dropId);
        return { id: dropId, title: drop?.title ?? null, ...row };
      }),
    );
    drops.sort((a, b) => (b.lastFulfilledAt ?? 0) - (a.lastFulfilledAt ?? 0));

    return {
      walletBalance: chef.walletBalance,
      freezeThreshold: threshold,
      totalEarnings: drops.reduce((a, d) => a + d.chefEarnings, 0),
      drops,
    };
  },
});

/** BUYER applies to become a chef — submits kitchen info + two ownership-checked uploads. */
export const apply = mutation({
  args: {
    sessionToken: v.string(),
    kitchenName: v.string(),
    area: v.string(),
    cuisine: v.optional(v.string()),
    foodBadgeUploadId: v.id("uploads"),
    nationalIdUploadId: v.id("uploads"),
  },
  handler: async (ctx, { sessionToken, kitchenName, area, cuisine, foodBadgeUploadId, nationalIdUploadId }) => {
    const session = await parseSessionToken(sessionToken);
    if (!session) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Not authenticated" });

    const badge = await ctx.db.get(foodBadgeUploadId);
    const nid = await ctx.db.get(nationalIdUploadId);
    if (!badge || badge.userId !== session.userId || !nid || nid.userId !== session.userId) {
      throw new ConvexError({ code: "FORBIDDEN", message: "Document uploads must belong to the authenticated user." });
    }

    const user = await ctx.db.get(session.userId);
    let chef = user?.chefId ? await ctx.db.get(user.chefId) : null;
    if (chef?.verificationStatus === "PENDING_REVIEW") throw new ConvexError({ code: "CONFLICT", message: "Your application is already under review." });
    if (chef?.verificationStatus === "VERIFIED") throw new ConvexError({ code: "CONFLICT", message: "Your chef profile is already verified." });

    const patch = {
      name: kitchenName,
      handle: `@${kitchenName.toLowerCase().replace(/[^a-z0-9]/g, "")}`,
      cuisine: cuisine ?? "Home Cooking",
      region: area,
      isVerified: false,
      verificationStatus: "PENDING_REVIEW" as const,
      foodBadgeUploadId,
      nationalIdUploadId,
      submittedAt: Date.now(),
      rejectionReason: undefined,
    };

    let chefId;
    if (chef) {
      await ctx.db.patch(chef._id, patch);
      chefId = chef._id;
    } else {
      chefId = await ctx.db.insert("chefs", { ...patch, rating: 0, totalDrops: 0, successfulDrops: 0, points: 0, rank: 999, walletBalance: 0 });
      await ctx.db.patch(session.userId, { chefId, area });
    }

    return { chefId, verificationStatus: "PENDING_REVIEW" as const, message: "Application submitted. An admin will review your documents shortly." };
  },
});
