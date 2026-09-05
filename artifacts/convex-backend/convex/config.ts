import { query, mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { parseSessionToken } from "./lib/auth";

export const DEFAULT_PLATFORM_FEE_RATE = 0.1;
export const DEFAULT_MEMBER_DISCOUNT = 0.1;
export const DEFAULT_WALLET_FREEZE_THRESHOLD = -50;
export const DEFAULT_BOOST_PRICE = 15;
export const DEFAULT_BOOST_DURATION_HOURS = 24;
export const DEFAULT_NO_SHOW_PENALTY = 10;

export const get = query({
  args: {},
  handler: async (ctx) => {
    const cfg = await ctx.db
      .query("config")
      .withIndex("by_key", (q) => q.eq("key", "platform"))
      .unique();
    if (!cfg) {
      return {
        platformFeeRate: DEFAULT_PLATFORM_FEE_RATE,
        memberDiscountRate: DEFAULT_MEMBER_DISCOUNT,
        markupRate: 0,
        clubPassPrice: 5,
        walletFreezeThreshold: DEFAULT_WALLET_FREEZE_THRESHOLD,
        boostPrice: DEFAULT_BOOST_PRICE,
        noShowPenalty: DEFAULT_NO_SHOW_PENALTY,
      };
    }
    return {
      ...cfg,
      boostPrice: cfg.boostPrice ?? DEFAULT_BOOST_PRICE,
      noShowPenalty: cfg.noShowPenalty ?? DEFAULT_NO_SHOW_PENALTY,
    };
  },
});

/** Admin-only config update — invalidation is automatic: Convex queries are
 *  reactive, so every client re-renders the instant this mutation commits.
 *  No manual cache to bust (this replaces HANDOVER.md Priority 1 item #2). */
export const update = mutation({
  args: {
    sessionToken: v.string(),
    platformFeeRate: v.optional(v.number()),
    memberDiscountRate: v.optional(v.number()),
    markupRate: v.optional(v.number()),
    clubPassPrice: v.optional(v.number()),
    walletFreezeThreshold: v.optional(v.number()),
    boostPrice: v.optional(v.number()),
    noShowPenalty: v.optional(v.number()),
  },
  handler: async (ctx, { sessionToken, ...patch }) => {
    const session = await parseSessionToken(sessionToken);
    if (session?.role !== "ADMIN") throw new ConvexError({ code: "FORBIDDEN", message: "Requires role: ADMIN" });
    const cfg = await ctx.db
      .query("config")
      .withIndex("by_key", (q) => q.eq("key", "platform"))
      .unique();
    if (!cfg) {
      await ctx.db.insert("config", {
        key: "platform",
        platformFeeRate: patch.platformFeeRate ?? DEFAULT_PLATFORM_FEE_RATE,
        memberDiscountRate: patch.memberDiscountRate ?? DEFAULT_MEMBER_DISCOUNT,
        markupRate: patch.markupRate ?? 0,
        clubPassPrice: patch.clubPassPrice ?? 5,
        walletFreezeThreshold: patch.walletFreezeThreshold ?? DEFAULT_WALLET_FREEZE_THRESHOLD,
        boostPrice: patch.boostPrice ?? DEFAULT_BOOST_PRICE,
        noShowPenalty: patch.noShowPenalty ?? DEFAULT_NO_SHOW_PENALTY,
      });
      return;
    }
    await ctx.db.patch(cfg._id, patch);
  },
});
