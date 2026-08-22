import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { parseSessionToken } from "./lib/auth";

export const listMine = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const session = await parseSessionToken(sessionToken);
    if (!session) return [];
    const favs = await ctx.db.query("favorites").withIndex("by_userId", (q) => q.eq("userId", session.userId)).collect();
    return Promise.all(favs.map(async (f) => ctx.db.get(f.chefId)));
  },
});

export const toggle = mutation({
  args: { sessionToken: v.string(), chefId: v.id("chefs") },
  handler: async (ctx, { sessionToken, chefId }) => {
    const session = await parseSessionToken(sessionToken);
    if (!session) throw new ConvexError("Not authenticated");
    const existing = await ctx.db
      .query("favorites")
      .withIndex("by_userId_chefId", (q) => q.eq("userId", session.userId).eq("chefId", chefId))
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
      return { favorited: false };
    }
    await ctx.db.insert("favorites", { userId: session.userId, chefId });
    return { favorited: true };
  },
});
