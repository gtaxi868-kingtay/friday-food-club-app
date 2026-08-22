import { query } from "./_generated/server";
import { v } from "convex/values";

/** Is it currently Friday in Trinidad & Tobago (UTC-4, no DST)? */
function isFridayInTrinidad(): boolean {
  const day = new Date().toLocaleDateString("en-US", {
    timeZone: "America/Port_of_Spain",
    weekday: "long",
  });
  return day === "Friday";
}

/** Reactive drop feed. Secret drops are filtered server-side unless it's
 *  currently Friday in Trinidad — this is the enforcement point that used
 *  to live in the orders POST route; here it also hides them from the feed
 *  itself, which the old REST API didn't do. */
export const list = query({
  args: {
    status: v.optional(v.string()),
    mealSlot: v.optional(v.string()),
  },
  handler: async (ctx, { status, mealSlot }) => {
    let drops = status
      ? await ctx.db.query("drops").withIndex("by_status", (q) => q.eq("status", status as any)).collect()
      : await ctx.db.query("drops").collect();

    if (mealSlot) drops = drops.filter((d) => d.mealSlot === mealSlot);

    const fridayOk = isFridayInTrinidad();
    drops = drops.filter((d) => !d.isSecret || fridayOk);

    const withChef = await Promise.all(
      drops.map(async (d) => {
        const chef = await ctx.db.get(d.chefId);
        return {
          ...d,
          chefName: chef?.name ?? null,
          chefHandle: chef?.handle ?? null,
          remaining: Math.max(0, d.inventory - d.currentOrders),
        };
      }),
    );

    return withChef.sort((a, b) => b._creationTime - a._creationTime);
  },
});

export const get = query({
  args: { dropId: v.id("drops") },
  handler: async (ctx, { dropId }) => {
    const drop = await ctx.db.get(dropId);
    if (!drop) return null;
    const chef = await ctx.db.get(drop.chefId);
    return { ...drop, chefName: chef?.name ?? null, remaining: Math.max(0, drop.inventory - drop.currentOrders) };
  },
});
