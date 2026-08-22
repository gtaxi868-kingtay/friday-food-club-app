/** Admin-managed pickup spots + chef pinning. */
import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { parseSessionToken } from "./lib/auth";

async function requireAdmin(sessionToken: string) {
  const session = await parseSessionToken(sessionToken);
  if (session?.role !== "ADMIN") throw new ConvexError({ code: "FORBIDDEN", message: "Requires role: ADMIN" });
}

export const list = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    await requireAdmin(sessionToken);
    const locations = await ctx.db.query("locations").collect();
    return Promise.all(
      locations.map(async (l) => {
        const pins = await ctx.db.query("locationPins").withIndex("by_locationId", (q) => q.eq("locationId", l._id)).collect();
        const pinnedChefs = await Promise.all(
          pins.map(async (p) => {
            const c = await ctx.db.get(p.chefId);
            return c && { id: c._id, name: c.name, handle: c.handle, isVerified: c.isVerified };
          }),
        );
        return { ...l, pinnedChefs: pinnedChefs.filter(Boolean) };
      }),
    );
  },
});

/** Unauthenticated — chefs pick a pickup spot when posting a drop, buyers
 *  read it back to render an "Open in Maps" link. No admin-only detail here. */
export const listPublic = query({
  args: {},
  handler: async (ctx) => {
    const locations = await ctx.db.query("locations").collect();
    return locations.map((l) => ({
      id: l._id,
      name: l.name,
      address: l.address,
      region: l.region,
      lat: l.lat ?? null,
      lng: l.lng ?? null,
    }));
  },
});

export const create = mutation({
  args: {
    sessionToken: v.string(),
    name: v.string(),
    address: v.string(),
    region: v.string(),
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
    isPinnable: v.optional(v.boolean()),
    nfcId: v.optional(v.string()),
  },
  handler: async (ctx, { sessionToken, isPinnable, ...rest }) => {
    await requireAdmin(sessionToken);
    const id = await ctx.db.insert("locations", { ...rest, isPinnable: isPinnable === true });
    return { id };
  },
});

export const update = mutation({
  args: {
    sessionToken: v.string(),
    locationId: v.id("locations"),
    name: v.string(),
    address: v.string(),
    region: v.string(),
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
    isPinnable: v.optional(v.boolean()),
    nfcId: v.optional(v.string()),
  },
  handler: async (ctx, { sessionToken, locationId, isPinnable, ...rest }) => {
    await requireAdmin(sessionToken);
    await ctx.db.patch(locationId, { ...rest, isPinnable: isPinnable === true });
    return { ok: true };
  },
});

export const remove = mutation({
  args: { sessionToken: v.string(), locationId: v.id("locations") },
  handler: async (ctx, { sessionToken, locationId }) => {
    await requireAdmin(sessionToken);
    const pins = await ctx.db.query("locationPins").withIndex("by_locationId", (q) => q.eq("locationId", locationId)).collect();
    await Promise.all(pins.map((p) => ctx.db.delete(p._id)));
    await ctx.db.delete(locationId);
    return { ok: true };
  },
});

export const pinChef = mutation({
  args: { sessionToken: v.string(), locationId: v.id("locations"), chefId: v.id("chefs") },
  handler: async (ctx, { sessionToken, locationId, chefId }) => {
    await requireAdmin(sessionToken);
    const existing = (await ctx.db.query("locationPins").withIndex("by_locationId", (q) => q.eq("locationId", locationId)).collect()).find(
      (p) => p.chefId === chefId,
    );
    if (!existing) await ctx.db.insert("locationPins", { locationId, chefId });
    await ctx.db.patch(chefId, { isPinned: true });
    return { ok: true };
  },
});

export const unpinChef = mutation({
  args: { sessionToken: v.string(), locationId: v.id("locations"), chefId: v.id("chefs") },
  handler: async (ctx, { sessionToken, locationId, chefId }) => {
    await requireAdmin(sessionToken);
    const pin = (await ctx.db.query("locationPins").withIndex("by_locationId", (q) => q.eq("locationId", locationId)).collect()).find(
      (p) => p.chefId === chefId,
    );
    if (pin) await ctx.db.delete(pin._id);
    const remaining = await ctx.db.query("locationPins").withIndex("by_chefId", (q) => q.eq("chefId", chefId)).collect();
    if (remaining.length === 0) await ctx.db.patch(chefId, { isPinned: false });
    return { ok: true };
  },
});
