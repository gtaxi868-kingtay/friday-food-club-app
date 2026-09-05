import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { parseSessionToken, requireVerifiedChef } from "./lib/auth";
import { DEFAULT_WALLET_FREEZE_THRESHOLD, DEFAULT_BOOST_PRICE, DEFAULT_BOOST_DURATION_HOURS } from "./config";

/** A boost only counts while it hasn't lapsed — admin-curated features
 *  (CurationPanel toggle, no featuredUntil) never expire on their own. */
function isFeaturedNow(d: { isFeatured?: boolean; featuredUntil?: number }, now: number): boolean {
  if (!d.isFeatured) return false;
  return d.featuredUntil === undefined || d.featuredUntil > now;
}

/** Is it currently Friday in Trinidad & Tobago (UTC-4, no DST)? */
function isFridayInTrinidad(): boolean {
  const day = new Date().toLocaleDateString("en-US", {
    timeZone: "America/Port_of_Spain",
    weekday: "long",
  });
  return day === "Friday";
}

/** Great-circle distance in km between two lat/lng points (haversine). */
function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Reactive drop feed. Secret drops are filtered server-side unless it's
 *  currently Friday in Trinidad — this is the enforcement point that used
 *  to live in the orders POST route; here it also hides them from the feed
 *  itself, which the old REST API didn't do.
 *
 *  When the caller supplies their lat/lng, drops are ranked by distance
 *  from the user instead of recency — drops without pickup coordinates
 *  (older seed data, pre-map-feature) sort after every drop that has them,
 *  in their original recency order, rather than being treated as "closest". */
export const list = query({
  args: {
    status: v.optional(v.string()),
    mealSlot: v.optional(v.string()),
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
  },
  handler: async (ctx, { status, mealSlot, lat, lng }) => {
    let drops = status
      ? await ctx.db.query("drops").withIndex("by_status", (q) => q.eq("status", status as any)).collect()
      : await ctx.db.query("drops").collect();

    if (mealSlot) drops = drops.filter((d) => d.mealSlot === mealSlot);

    const fridayOk = isFridayInTrinidad();
    drops = drops.filter((d) => !d.isSecret || fridayOk);

    const now = Date.now();
    const withChef = await Promise.all(
      drops.map(async (d) => {
        const chef = await ctx.db.get(d.chefId);
        const distanceKm_ =
          lat !== undefined && lng !== undefined && d.pickupLat !== undefined && d.pickupLng !== undefined
            ? distanceKm(lat, lng, d.pickupLat, d.pickupLng)
            : null;
        return {
          ...d,
          chefName: chef?.name ?? null,
          chefHandle: chef?.handle ?? null,
          chefIsVerified: chef?.isVerified ?? false,
          remaining: Math.max(0, d.inventory - d.currentOrders),
          distanceKm: distanceKm_,
          isFeatured: isFeaturedNow(d, now),
        };
      }),
    );

    const byRecency = (a: typeof withChef[number], b: typeof withChef[number]) => b._creationTime - a._creationTime;
    const byFeaturedThen = (cmp: typeof byRecency) => (a: typeof withChef[number], b: typeof withChef[number]) =>
      Number(b.isFeatured) - Number(a.isFeatured) || cmp(a, b);

    if (lat === undefined || lng === undefined) {
      return withChef.sort(byFeaturedThen(byRecency));
    }

    return withChef.sort(
      byFeaturedThen((a, b) => {
        if (a.distanceKm === null && b.distanceKm === null) return byRecency(a, b);
        if (a.distanceKm === null) return 1;
        if (b.distanceKm === null) return -1;
        return a.distanceKm - b.distanceKm;
      }),
    );
  },
});

/** Chef self-serve paid placement — debits the chef's own wallet (no
 *  gateway hop needed, it's an internal ledger move) and pins the drop to
 *  the top of the feed for a fixed window. Distinct from admin's free
 *  CurationPanel toggle, which never expires. */
export const boost = mutation({
  args: { sessionToken: v.string(), dropId: v.id("drops") },
  handler: async (ctx, { sessionToken, dropId }) => {
    const session = await parseSessionToken(sessionToken);
    if (!session) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Not authenticated" });

    const drop = await ctx.db.get(dropId);
    if (!drop) throw new ConvexError({ code: "NOT_FOUND", message: "Drop not found" });

    if (session.role !== "ADMIN") {
      const user = await ctx.db.get(session.userId);
      if (user?.chefId !== drop.chefId) {
        throw new ConvexError({ code: "FORBIDDEN", message: "You can only boost your own drops" });
      }
    }
    if (drop.status !== "ACTIVE") {
      throw new ConvexError({ code: "INVALID_STATE", message: "Only active drops can be boosted" });
    }
    const now = Date.now();
    if (isFeaturedNow(drop, now)) {
      throw new ConvexError({ code: "CONFLICT", message: "This drop is already featured" });
    }

    const cfg = await ctx.db.query("config").withIndex("by_key", (q) => q.eq("key", "platform")).unique();
    const boostPrice = cfg?.boostPrice ?? DEFAULT_BOOST_PRICE;

    const chef = await ctx.db.get(drop.chefId);
    if (!chef) throw new ConvexError({ code: "NOT_FOUND", message: "Chef not found" });
    if (chef.walletBalance < boostPrice) {
      throw new ConvexError({
        code: "INSUFFICIENT_FUNDS",
        message: `Boosting costs ${boostPrice.toFixed(2)} TTD — your wallet balance is ${chef.walletBalance.toFixed(2)} TTD.`,
      });
    }

    const featuredUntil = now + DEFAULT_BOOST_DURATION_HOURS * 3_600_000;
    await ctx.db.patch(dropId, { isFeatured: true, featuredUntil });
    const newBalance = chef.walletBalance - boostPrice;
    await ctx.db.patch(chef._id, { walletBalance: newBalance });
    await ctx.db.insert("adminCredits", {
      chefId: chef._id,
      amount: -boostPrice,
      note: `Self-serve boost: "${drop.title}"`,
    });

    return { id: dropId, isFeatured: true, featuredUntil, chefWalletBalance: newBalance, boostPrice };
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
    locationId: v.id("locations"),
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

    const location = await ctx.db.get(args.locationId);
    if (!location) throw new ConvexError({ code: "NOT_FOUND", message: "Selected pickup spot not found" });

    // Find-or-create the persistent Dish this drop belongs to. "When it's
    // gone, it's gone" only ever means this batch — the dish itself stays
    // on the chef's menu (see dishes.list) so members can vote to see it
    // dropped again, matched by (chef, title) so re-running the same dish
    // accumulates history instead of forking a duplicate menu entry.
    const now = Date.now();
    const normalizedTitle = args.title.trim().toLowerCase();
    const chefDishes = await ctx.db.query("dishes").withIndex("by_chefId", (q) => q.eq("chefId", args.chefId)).collect();
    let dish = chefDishes.find((d) => d.title.trim().toLowerCase() === normalizedTitle);
    let dishId;
    if (dish) {
      await ctx.db.patch(dish._id, {
        description: args.description,
        mealSlot: args.mealSlot,
        imageIndex: args.imageIndex,
        tags: args.tags,
        timesDropped: dish.timesDropped + 1,
        lastDroppedAt: now,
      });
      dishId = dish._id;
    } else {
      dishId = await ctx.db.insert("dishes", {
        chefId: args.chefId,
        title: args.title,
        description: args.description,
        mealSlot: args.mealSlot,
        imageIndex: args.imageIndex,
        tags: args.tags,
        timesDropped: 1,
        loveCount: 0,
        lastDroppedAt: now,
      });
    }

    const dropId = await ctx.db.insert("drops", {
      chefId: args.chefId,
      dishId,
      title: args.title,
      description: args.description,
      mealSlot: args.mealSlot,
      price: args.price,
      inventory: args.inventory,
      minOrders: args.minOrders,
      currentOrders: 0,
      status: "ACTIVE",
      pickupLocation: `${location.name}, ${location.address}`,
      locationId: args.locationId,
      pickupLat: location.lat,
      pickupLng: location.lng,
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

/** Update the buyer-visible fields of a live drop.
 *
 * Ownership and inventory invariants are enforced here rather than in the
 * mobile form. Existing orders can never be invalidated by lowering the
 * plate limit, and a cancelled/expired drop cannot be silently re-opened.
 */
export const update = mutation({
  args: {
    sessionToken: v.string(),
    dropId: v.id("drops"),
    title: v.string(),
    description: v.string(),
    price: v.number(),
    inventory: v.number(),
    minOrders: v.number(),
    pickupLocation: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const session = await parseSessionToken(args.sessionToken);
    if (!session) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Not authenticated" });
    await requireVerifiedChef(ctx, session);

    const drop = await ctx.db.get(args.dropId);
    if (!drop) throw new ConvexError({ code: "NOT_FOUND", message: "Drop not found" });
    if (drop.status === "CANCELLED" || drop.status === "EXPIRED") {
      throw new ConvexError({ code: "INVALID_STATE", message: "Only a live drop can be edited" });
    }
    if (args.title.trim().length < 2 || args.description.trim().length < 2 || args.pickupLocation.trim().length < 2) {
      throw new ConvexError({ code: "INVALID_INPUT", message: "Title, description, and pickup location are required" });
    }
    if (!Number.isFinite(args.price) || args.price <= 0) {
      throw new ConvexError({ code: "INVALID_INPUT", message: "Price must be greater than zero" });
    }
    if (!Number.isInteger(args.inventory) || args.inventory < drop.currentOrders) {
      throw new ConvexError({ code: "INVALID_INPUT", message: "Plate limit cannot be below existing orders" });
    }
    if (!Number.isInteger(args.minOrders) || args.minOrders < 1 || args.minOrders > args.inventory) {
      throw new ConvexError({ code: "INVALID_INPUT", message: "Minimum orders must be between 1 and the plate limit" });
    }
    if (!Number.isFinite(args.expiresAt) || args.expiresAt <= Date.now()) {
      throw new ConvexError({ code: "INVALID_INPUT", message: "Expiry must be in the future" });
    }

    if (session.role !== "ADMIN") {
      const user = await ctx.db.get(session.userId);
      if (!user?.chefId || user.chefId !== drop.chefId) {
        throw new ConvexError({ code: "FORBIDDEN", message: "You can only edit your own drops" });
      }
    }

    await ctx.db.patch(drop._id, {
      title: args.title.trim(),
      description: args.description.trim(),
      price: Math.round(args.price * 100) / 100,
      inventory: args.inventory,
      minOrders: args.minOrders,
      pickupLocation: args.pickupLocation.trim(),
      expiresAt: args.expiresAt,
      status: drop.currentOrders >= args.inventory ? "SOLD_OUT" : "ACTIVE",
    });

    return ctx.db.get(drop._id);
  },
});
