/**
 * Pre-launch waitlist — buyers who want to be notified when a drop is
 * live, and chefs/bakers/confectioners who want to be told there's real
 * demand before committing to cook anything. Public mutation (no signup
 * flow exists yet — this predates the app being usable); admin-only read.
 */
import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { parseSessionToken } from "./lib/auth";

export const join = mutation({
  args: {
    name: v.string(),
    contact: v.string(),
    role: v.union(v.literal("BUYER"), v.literal("CHEF")),
    area: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.name.trim().length < 2) throw new ConvexError("Enter your name");
    if (args.contact.trim().length < 5) throw new ConvexError("Enter a phone number or email");
    await ctx.db.insert("waitlist", {
      name: args.name.trim(),
      contact: args.contact.trim(),
      role: args.role,
      area: args.area?.trim() || undefined,
      notes: args.notes?.trim() || undefined,
    });
    return { ok: true };
  },
});

export const list = query({
  args: { sessionToken: v.string(), role: v.optional(v.union(v.literal("BUYER"), v.literal("CHEF"))) },
  handler: async (ctx, { sessionToken, role }) => {
    const session = await parseSessionToken(sessionToken);
    if (session?.role !== "ADMIN") throw new ConvexError({ code: "FORBIDDEN", message: "Requires role: ADMIN" });
    const rows = role
      ? await ctx.db.query("waitlist").withIndex("by_role", (q) => q.eq("role", role)).collect()
      : await ctx.db.query("waitlist").collect();
    return rows.sort((a, b) => b._creationTime - a._creationTime);
  },
});
