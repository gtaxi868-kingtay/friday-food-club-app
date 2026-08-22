import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { parseSessionToken, requireVerifiedChef } from "./lib/auth";
import { DEFAULT_WALLET_FREEZE_THRESHOLD } from "./config";

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

/** Chef posts a new drop — mirrors POST /api/drops's ownership, wallet-freeze,
 *  and upload-ownership checks. Admins may post for any chef. */
export const create = mutation({
  args: {
    sessionToken: v.string(),
    chefId: v.id("chefs"),
    title: v.string(),
    description: v.string(),
    mealSlot: v.string(),
    price: v.number(),
    inventory: v.number(),
    minOrders: v.number(),
    pickupLocation: v.string(),
    expiresAt: v.number(),
    imageIndex: v.number(),
    imageUploadId: v.optional(v.id("uploads")),
    tags: v.array(v.string()),
    isSecret: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const session = await parseSessionToken(args.sessionToken);
    if (!session) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Not authenticated" });
    await requireVerifiedChef(ctx, session);

    if (session.role !== "ADMIN") {
      const user = await ctx.db.get(session.userId);
      if (user?.chefId !== args.chefId) {
        throw new ConvexError({ code: "FORBIDDEN", message: "You can only create drops for your own chef profile" });
      }
      const chef = await ctx.db.get(args.chefId);
      const cfg = await ctx.db.query("config").withIndex("by_key", (q) => q.eq("key", "platform")).unique();
      const threshold = cfg?.walletFreezeThreshold ?? DEFAULT_WALLET_FREEZE_THRESHOLD;
      if ((chef?.walletBalance ?? 0) < threshold) {
        throw new ConvexError({
          code: "WALLET_FROZEN",
          message: `Your wallet balance is ${(chef?.walletBalance ?? 0).toFixed(2)} TTD — below the platform limit. Settle your cash fees before posting new drops.`,
        });
      }
    }

    if (args.inventory < args.minOrders) {
      throw new ConvexError("inventory must be >= minOrders (can't have hard cap below payout threshold)");
    }

    if (args.imageUploadId) {
      const upload = await ctx.db.get(args.imageUploadId);
      if (!upload || upload.userId !== session.userId) {
        throw new ConvexError({ code: "FORBIDDEN", message: "You do not own this upload or it does not exist" });
      }
    }

    const chefExists = await ctx.db.get(args.chefId);
    if (!chefExists) throw new ConvexError({ code: "NOT_FOUND", message: `Chef ${args.chefId} not found` });

    const dropId = await ctx.db.insert("drops", {
      chefId: args.chefId,
      title: args.title,
      description: args.description,
      mealSlot: args.mealSlot,
      price: args.price,
      inventory: args.inventory,
      minOrders: args.minOrders,
      currentOrders: 0,
      status: "ACTIVE",
      pickupLocation: args.pickupLocation,
      expiresAt: args.expiresAt,
      imageIndex: args.imageIndex,
      tags: args.tags,
      isSecret: args.isSecret ?? false,
    });
    return ctx.db.get(dropId);
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
