/** Club Pass subscriptions — $5/month, 10% member discount. */
import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { parseSessionToken } from "./lib/auth";

const CLUB_PASS_PRICE = 5.0;
const PASS_DURATION_MS = 30 * 86_400_000;

function requireOwn(session: { userId: any; role: string } | null, userId: any) {
  if (session?.role === "ADMIN") return;
  if (!session || session.userId !== userId) {
    throw new ConvexError({ code: "FORBIDDEN", message: "Not authorized for this user" });
  }
}

export const mine = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const session = await parseSessionToken(sessionToken);
    if (!session) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Not authenticated" });
    const now = Date.now();
    const active = (await ctx.db.query("subscriptions").withIndex("by_userId", (q) => q.eq("userId", session.userId)).collect())
      .filter((s) => s.status === "ACTIVE" && s.expiresAt > now)
      .sort((a, b) => b.startedAt - a.startedAt)[0];
    return { isActive: !!active, subscription: active ?? null };
  },
});

export const subscribe = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const session = await parseSessionToken(sessionToken);
    if (!session) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Not authenticated" });
    const now = Date.now();
    const existing = (await ctx.db.query("subscriptions").withIndex("by_userId", (q) => q.eq("userId", session.userId)).collect()).find(
      (s) => s.status === "ACTIVE" && s.expiresAt > now,
    );
    if (existing) throw new ConvexError({ code: "CONFLICT", message: "User already has an active Club Pass", subscriptionId: existing._id });

    const expiresAt = now + PASS_DURATION_MS;
    const subId = await ctx.db.insert("subscriptions", {
      userId: session.userId,
      tier: "CLUB_PASS",
      status: "PENDING_PAYMENT",
      price: CLUB_PASS_PRICE,
      startedAt: now,
      expiresAt,
    });
    return {
      subscriptionId: subId,
      userId: session.userId,
      tier: "CLUB_PASS" as const,
      status: "PENDING_PAYMENT" as const,
      price: CLUB_PASS_PRICE,
      expiresAt,
      paymentRequired: true,
      benefits: [
        "10% member discount on all drops",
        "Priority access to limited drops",
        "Exclusive Club Pass badge",
        "Early drop notifications",
      ],
    };
  },
});

export const cancel = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const session = await parseSessionToken(sessionToken);
    if (!session) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Not authenticated" });
    const active = (await ctx.db.query("subscriptions").withIndex("by_userId", (q) => q.eq("userId", session.userId)).collect()).find(
      (s) => s.status === "ACTIVE",
    );
    if (!active) throw new ConvexError({ code: "NOT_FOUND", message: "No active subscription found" });
    await ctx.db.patch(active._id, { status: "CANCELLED", cancelledAt: Date.now() });
    return { subscriptionId: active._id, status: "CANCELLED" as const, validUntil: active.expiresAt };
  },
});

/** Admin: all subscriptions + monthly revenue — reactive dashboard feed. */
export const listAll = query({
  args: { sessionToken: v.string(), status: v.optional(v.string()) },
  handler: async (ctx, { sessionToken, status }) => {
    const session = await parseSessionToken(sessionToken);
    if (session?.role !== "ADMIN") throw new ConvexError({ code: "FORBIDDEN", message: "Requires role: ADMIN" });

    let subs = await ctx.db.query("subscriptions").collect();
    if (status) subs = subs.filter((s) => s.status === status.toUpperCase());
    subs.sort((a, b) => b.startedAt - a.startedAt);

    const withUser = await Promise.all(
      subs.map(async (s) => {
        const user = await ctx.db.get(s.userId);
        return { ...s, userName: user?.name ?? null };
      }),
    );
    const monthlyRevenue = withUser.filter((s) => s.status === "ACTIVE").reduce((acc, s) => acc + s.price, 0);
    return { subscriptions: withUser, total: withUser.length, monthlyRevenue };
  },
});
