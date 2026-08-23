/**
 * A chef's permanent menu. Drops are time-boxed sales of a Dish — when a
 * drop closes, the Dish stays on the chef's profile so it can be voted
 * back onto the board instead of vanishing with the batch.
 *
 * Loving/voting on a dish is gated: only Club Pass members who have
 * actually pre-ordered that dish at least once may vote for it — this is
 * a "bring this back" signal from people who've genuinely tried it, not
 * an open popularity poll.
 */
import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { parseSessionToken } from "./lib/auth";

/** A chef's public menu — every dish they've ever dropped, most-loved first. */
export const list = query({
  args: { chefId: v.id("chefs"), sessionToken: v.optional(v.string()) },
  handler: async (ctx, { chefId, sessionToken }) => {
    const dishes = await ctx.db.query("dishes").withIndex("by_chefId", (q) => q.eq("chefId", chefId)).collect();

    const session = sessionToken ? await parseSessionToken(sessionToken) : null;
    let lovedIds = new Set<string>();
    let orderedDishIds = new Set<string>();
    let isMember = false;

    if (session) {
      const [loves, orders, activeSub] = await Promise.all([
        ctx.db.query("dishLoves").withIndex("by_userId", (q) => q.eq("userId", session.userId)).collect(),
        ctx.db.query("orders").withIndex("by_userId", (q) => q.eq("userId", session.userId)).collect(),
        ctx.db
          .query("subscriptions")
          .withIndex("by_userId", (q) => q.eq("userId", session.userId))
          .filter((q) => q.eq(q.field("status"), "ACTIVE"))
          .first(),
      ]);
      lovedIds = new Set(loves.map((l) => l.dishId));
      isMember = !!activeSub && activeSub.expiresAt > Date.now();

      const dropsOrdered = (
        await Promise.all(
          orders.filter((o) => o.status !== "CANCELLED").map((o) => ctx.db.get(o.dropId)),
        )
      ).filter((d): d is NonNullable<typeof d> => !!d);
      orderedDishIds = new Set(dropsOrdered.filter((d) => d.dishId).map((d) => d.dishId as string));
    }

    return dishes
      .map((d) => ({
        ...d,
        lovedByMe: lovedIds.has(d._id),
        canLove: isMember && orderedDishIds.has(d._id),
      }))
      .sort((a, b) => b.loveCount - a.loveCount || b.lastDroppedAt - a.lastDroppedAt);
  },
});

export const toggleLove = mutation({
  args: { sessionToken: v.string(), dishId: v.id("dishes") },
  handler: async (ctx, { sessionToken, dishId }) => {
    const session = await parseSessionToken(sessionToken);
    if (!session) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Not authenticated" });

    const dish = await ctx.db.get(dishId);
    if (!dish) throw new ConvexError({ code: "NOT_FOUND", message: "Dish not found" });

    const activeSub = await ctx.db
      .query("subscriptions")
      .withIndex("by_userId", (q) => q.eq("userId", session.userId))
      .filter((q) => q.eq(q.field("status"), "ACTIVE"))
      .first();
    if (!activeSub || activeSub.expiresAt <= Date.now()) {
      throw new ConvexError({ code: "MEMBERS_ONLY", message: "Club Pass members can vote on dishes — subscribe to unlock this." });
    }

    const myOrders = await ctx.db.query("orders").withIndex("by_userId", (q) => q.eq("userId", session.userId)).collect();
    const hasOrderedThisDish = (
      await Promise.all(
        myOrders.filter((o) => o.status !== "CANCELLED").map((o) => ctx.db.get(o.dropId)),
      )
    ).some((d) => d?.dishId === dishId);
    if (!hasOrderedThisDish) {
      throw new ConvexError({ code: "NOT_ORDERED", message: "Pre-order this dish at least once before voting for it." });
    }

    const existing = await ctx.db
      .query("dishLoves")
      .withIndex("by_dishId_userId", (q) => q.eq("dishId", dishId).eq("userId", session.userId))
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
      await ctx.db.patch(dishId, { loveCount: Math.max(0, dish.loveCount - 1) });
      return { loved: false, loveCount: Math.max(0, dish.loveCount - 1) };
    }

    await ctx.db.insert("dishLoves", { dishId, userId: session.userId });
    await ctx.db.patch(dishId, { loveCount: dish.loveCount + 1 });
    return { loved: true, loveCount: dish.loveCount + 1 };
  },
});
