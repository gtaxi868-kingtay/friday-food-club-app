/**
 * NFC scan resolution — replaces POST /api/nfc/scan.
 *   type "location" — tag pinned at a pickup spot -> active drops from chefs pinned there.
 *   type "keychain"  — member's personal tag -> active drops from favorited chefs.
 */
import { mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";

async function activeDropsFor(ctx: any, chefIds: any[]) {
  const now = Date.now();
  const drops = (
    await Promise.all(chefIds.map((id) => ctx.db.query("drops").withIndex("by_chefId", (q: any) => q.eq("chefId", id)).collect()))
  ).flat();
  const active = drops.filter((d) => (d.status === "ACTIVE" || d.status === "SOLD_OUT") && d.expiresAt > now);
  return Promise.all(
    active
      .sort((a, b) => a.expiresAt - b.expiresAt)
      .map(async (d) => {
        const chef = await ctx.db.get(d.chefId);
        return {
          ...d,
          remaining: Math.max(0, d.inventory - d.currentOrders),
          chef: chef && {
            id: chef._id,
            name: chef.name,
            handle: chef.handle,
            cuisine: chef.cuisine,
            region: chef.region,
            isVerified: chef.isVerified,
            rating: chef.rating,
            totalDrops: chef.totalDrops,
            successfulDrops: chef.successfulDrops,
            points: chef.points,
            rank: chef.rank,
          },
        };
      }),
  );
}

export const scan = mutation({
  args: { nfcId: v.string(), type: v.union(v.literal("location"), v.literal("keychain")) },
  handler: async (ctx, { nfcId, type }) => {
    if (type === "location") {
      const location = await ctx.db.query("locations").withIndex("by_nfcId", (q) => q.eq("nfcId", nfcId)).unique();
      if (!location) throw new ConvexError({ code: "NOT_FOUND", message: "No location found for this NFC tag" });
      const pins = await ctx.db.query("locationPins").withIndex("by_locationId", (q) => q.eq("locationId", location._id)).collect();
      const drops = await activeDropsFor(ctx, pins.map((p) => p.chefId));
      return {
        type: "location" as const,
        location: { id: location._id, name: location.name, address: location.address, region: location.region },
        drops,
        total: drops.length,
      };
    }

    const user = await ctx.db.query("users").withIndex("by_nfcId", (q) => q.eq("nfcId", nfcId)).unique();
    if (!user) throw new ConvexError({ code: "NOT_FOUND", message: "No member found for this keychain" });
    const favs = await ctx.db.query("favorites").withIndex("by_userId", (q) => q.eq("userId", user._id)).collect();
    const drops = await activeDropsFor(ctx, favs.map((f) => f.chefId));
    return {
      type: "keychain" as const,
      member: { id: user._id, name: user.name },
      drops,
      total: drops.length,
    };
  },
});
