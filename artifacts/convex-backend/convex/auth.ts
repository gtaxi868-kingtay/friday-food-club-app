import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import {
  createSessionToken,
  hashPassword,
  parseSessionToken,
  verifyPassword,
} from "./lib/auth";

export const register = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    password: v.string(),
    area: v.optional(v.string()),
  },
  handler: async (ctx, { name, email, password, area }) => {
    if (name.length < 2 || name.length > 80) throw new ConvexError("Invalid name");
    if (password.length < 6 || password.length > 128) throw new ConvexError("Password must be 6-128 chars");
    const normalizedEmail = email.toLowerCase();

    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", normalizedEmail))
      .unique();
    if (existing) throw new ConvexError("An account with this email already exists");

    const passwordHash = await hashPassword(password);
    const userId = await ctx.db.insert("users", {
      name,
      email: normalizedEmail,
      passwordHash,
      role: "BUYER",
      area,
      points: 0,
      walletBalance: 0,
      handle: `@${name.toLowerCase().replace(/[^a-z0-9]/g, "")}`,
    });

    const token = await createSessionToken(userId, "BUYER");
    return { token, user: { id: userId, name, email: normalizedEmail, role: "BUYER" as const, area } };
  },
});

export const login = mutation({
  args: { email: v.string(), password: v.string() },
  handler: async (ctx, { email, password }) => {
    const normalizedEmail = email.toLowerCase();
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", normalizedEmail))
      .unique();
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw new ConvexError("Invalid email or password");
    }
    const token = await createSessionToken(user._id, user.role);
    return {
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        area: user.area,
        chefId: user.chefId,
      },
    };
  },
});

export const me = query({
  args: { sessionToken: v.optional(v.string()) },
  handler: async (ctx, { sessionToken }) => {
    const session = await parseSessionToken(sessionToken);
    if (!session) return null;
    const user = await ctx.db.get(session.userId);
    if (!user) return null;

    let chef = null;
    if (user.chefId) chef = await ctx.db.get(user.chefId);

    const activeSub = await ctx.db
      .query("subscriptions")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .filter((q) => q.eq(q.field("status"), "ACTIVE"))
      .first();

    return {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      area: user.area,
      walletBalance: user.walletBalance,
      chefId: user.chefId ?? null,
      chefVerified: chef?.isVerified ?? null,
      chefVerificationStatus: chef?.verificationStatus ?? null,
      isMember: activeSub !== null,
    };
  },
});

export const setPushToken = mutation({
  args: { sessionToken: v.string(), expoPushToken: v.string() },
  handler: async (ctx, { sessionToken, expoPushToken }) => {
    const session = await parseSessionToken(sessionToken);
    if (!session) throw new ConvexError("Not authenticated");
    await ctx.db.patch(session.userId, { expoPushToken });
  },
});

export const updateArea = mutation({
  args: { sessionToken: v.string(), area: v.string() },
  handler: async (ctx, { sessionToken, area }) => {
    const session = await parseSessionToken(sessionToken);
    if (!session) throw new ConvexError("Not authenticated");
    if (area.length < 2 || area.length > 80) throw new ConvexError("Invalid area");
    await ctx.db.patch(session.userId, { area });
  },
});
