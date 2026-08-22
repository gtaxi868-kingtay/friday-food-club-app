/**
 * One-shot seed — mirrors lib/schema.ts's CHEF_SEEDS / DROP_SEEDS / demo
 * accounts from the Express+Neo4j backend. Run once per fresh deployment:
 *   npx convex run seed:run
 * Idempotent: safe to re-run, skips anything that already exists.
 */
import { internalMutation, mutation } from "./_generated/server";
import { hashPassword } from "./lib/auth";
import { DEFAULT_MEMBER_DISCOUNT, DEFAULT_PLATFORM_FEE_RATE, DEFAULT_WALLET_FREEZE_THRESHOLD } from "./config";

const CHEF_SEEDS = [
  { key: "chef1", name: "Chef Marcus St. James", handle: "@marcusdrops", cuisine: "Trinidadian Fusion", region: "Port of Spain", isVerified: true, verificationStatus: "VERIFIED" as const, rating: 4.9, totalDrops: 23, successfulDrops: 21, points: 12840, rank: 1 },
  { key: "chef2", name: "Chef Simone Baptiste", handle: "@simoneeats", cuisine: "Caribbean Fine Dining", region: "San Fernando", isVerified: true, verificationStatus: "VERIFIED" as const, rating: 4.8, totalDrops: 18, successfulDrops: 16, points: 10250, rank: 2 },
  { key: "chef3", name: "Chef Anya Ramdeen", handle: "@anyasecret", cuisine: "Indo-Trini", region: "Chaguanas", isVerified: true, verificationStatus: "VERIFIED" as const, rating: 4.7, totalDrops: 15, successfulDrops: 13, points: 8900, rank: 3 },
  { key: "chef4", name: "Chef Ricardo Mose", handle: "@ricardofire", cuisine: "BBQ & Smoke", region: "Diego Martin", isVerified: false, verificationStatus: "PENDING_REVIEW" as const, rating: 4.6, totalDrops: 12, successfulDrops: 10, points: 7200, rank: 4 },
  { key: "chef5", name: "Chef Kamau Joseph", handle: "@kamaustreet", cuisine: "Street Food Elite", region: "Arima", isVerified: true, verificationStatus: "VERIFIED" as const, rating: 4.5, totalDrops: 11, successfulDrops: 9, points: 6100, rank: 5 },
  { key: "chef_pending_dev", name: "Chef Aaliya Hosein", handle: "@aaliyacooks", cuisine: "East Indian Street", region: "Couva", isVerified: false, verificationStatus: "PENDING_REVIEW" as const, rating: 0, totalDrops: 0, successfulDrops: 0, points: 0, rank: 999 },
];

const DROP_SEEDS = [
  { key: "drop1", chefKey: "chef1", title: "Braised Oxtail Perfection", description: "Slow-braised for 8 hours in a secret blend of Trinidad spices. Served with butter rice and fried plantain.", mealSlot: "Dinner", price: 45, inventory: 25, minOrders: 15, pickupLocation: "Port of Spain, Queen's Park Savannah", imageIndex: 1, tags: ["Exclusive", "Tonight Only"], expiresHoursFromNow: 3.5 },
  { key: "drop2", chefKey: "chef2", title: "Crab Back Roti Special", description: "Whole crab back stuffed with curried crab filling, wrapped in freshly made dhalpuri roti.", mealSlot: "Lunch", price: 55, inventory: 20, minOrders: 10, pickupLocation: "San Fernando, High Street", imageIndex: 2, tags: ["Signature", "Seafood"], expiresHoursFromNow: 6 },
  { key: "drop3", chefKey: "chef3", title: "Coconut Pelau x Stew Chicken", description: "Classic Trini pelau made with coconut milk, pigeon peas, and fall-off-the-bone stew chicken.", mealSlot: "Dinner", price: 28, inventory: 30, minOrders: 20, pickupLocation: "Chaguanas, Market Square", imageIndex: 3, tags: ["Almost Full", "Classic"], expiresHoursFromNow: 1.2 },
  { key: "drop4", chefKey: "chef4", title: "Butter Lobster Pasta Fusion", description: "Fresh Caribbean lobster in a saffron-butter cream sauce over house-made pasta.", mealSlot: "Dinner", price: 75, inventory: 12, minOrders: 8, pickupLocation: "Diego Martin, Library Junction", imageIndex: 1, tags: ["Premium", "Seafood"], expiresHoursFromNow: 4 },
  { key: "drop5", chefKey: "chef5", title: "Doubles & Doubles Only", description: "The best doubles in the city — bara fried to order, pepper sauce made fresh each morning.", mealSlot: "Breakfast", price: 15, inventory: 50, minOrders: 25, pickupLocation: "Arima, Market Drive", imageIndex: 2, tags: ["Community Fave", "Vegan"], expiresHoursFromNow: 8 },
];

export const run = mutation({
  args: {},
  handler: async (ctx) => {
    // platform config
    const existingCfg = await ctx.db.query("config").withIndex("by_key", (q) => q.eq("key", "platform")).unique();
    if (!existingCfg) {
      await ctx.db.insert("config", {
        key: "platform",
        platformFeeRate: DEFAULT_PLATFORM_FEE_RATE,
        memberDiscountRate: DEFAULT_MEMBER_DISCOUNT,
        markupRate: 0,
        clubPassPrice: 5,
        walletFreezeThreshold: DEFAULT_WALLET_FREEZE_THRESHOLD,
      });
    }

    // chefs
    const chefIdByKey: Record<string, any> = {};
    for (const c of CHEF_SEEDS) {
      const all = await ctx.db.query("chefs").collect();
      let existing = all.find((x) => x.handle === c.handle);
      if (!existing) {
        const id = await ctx.db.insert("chefs", {
          name: c.name,
          handle: c.handle,
          cuisine: c.cuisine,
          region: c.region,
          isVerified: c.isVerified,
          verificationStatus: c.verificationStatus,
          rating: c.rating,
          totalDrops: c.totalDrops,
          successfulDrops: c.successfulDrops,
          points: c.points,
          rank: c.rank,
          walletBalance: 0,
        });
        chefIdByKey[c.key] = id;
      } else {
        chefIdByKey[c.key] = existing._id;
      }
    }

    // drops
    const now = Date.now();
    for (const d of DROP_SEEDS) {
      const existingDrops = await ctx.db.query("drops").collect();
      const already = existingDrops.find((x) => x.title === d.title);
      if (already) continue;
      await ctx.db.insert("drops", {
        chefId: chefIdByKey[d.chefKey],
        title: d.title,
        description: d.description,
        mealSlot: d.mealSlot,
        price: d.price,
        inventory: d.inventory,
        minOrders: d.minOrders,
        currentOrders: 0,
        status: "ACTIVE",
        pickupLocation: d.pickupLocation,
        expiresAt: now + d.expiresHoursFromNow * 3_600_000,
        imageIndex: d.imageIndex,
        tags: d.tags,
      });
    }

    // demo accounts (dev only — call seed:runDemoAccounts explicitly, never in prod)
    return { chefs: Object.keys(chefIdByKey).length, ok: true };
  },
});

/** Separate from run() so it's never accidentally invoked against a
 *  production deployment — matches the NODE_ENV guard in the old
 *  lib/schema.ts. Call explicitly: npx convex run seed:runDemoAccounts */
export const runDemoAccounts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const accounts = [
      { name: "Platform Admin", email: "kingtay2632205@gmail.com", role: "ADMIN" as const, password: "2205263", area: "Port of Spain", chefHandle: null as string | null },
      { name: "Chef Marcus St. James", email: "marcus@fridayfood.club", role: "CHEF" as const, password: "chef123", area: "Port of Spain", chefHandle: "@marcusdrops" },
      { name: "Demo Buyer", email: "buyer@fridayfood.club", role: "BUYER" as const, password: "buyer123", area: "Woodbrook", chefHandle: null },
    ];
    for (const acc of accounts) {
      const existing = await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", acc.email)).unique();
      if (existing) continue;
      let chefId: any = undefined;
      if (acc.chefHandle) {
        const chefs = await ctx.db.query("chefs").collect();
        chefId = chefs.find((c) => c.handle === acc.chefHandle)?._id;
      }
      await ctx.db.insert("users", {
        name: acc.name,
        email: acc.email,
        passwordHash: await hashPassword(acc.password),
        role: acc.role,
        area: acc.area,
        points: 0,
        walletBalance: 0,
        handle: `@${acc.name.toLowerCase().replace(/[^a-z0-9]/g, "")}`,
        chefId,
      });
    }
    return { ok: true };
  },
});
