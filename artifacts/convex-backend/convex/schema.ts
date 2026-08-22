import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ── Users (buyers, chef-owners, admins) ──────────────────────────────
  users: defineTable({
    name: v.string(),
    handle: v.string(),
    email: v.string(),
    passwordHash: v.string(),
    role: v.union(v.literal("BUYER"), v.literal("CHEF"), v.literal("ADMIN")),
    area: v.optional(v.string()),
    nfcId: v.optional(v.string()),
    tier: v.optional(v.string()),
    points: v.number(),
    walletBalance: v.number(),
    chefId: v.optional(v.id("chefs")), // replaces IS_CHEF edge
    expoPushToken: v.optional(v.string()),
  })
    .index("by_email", ["email"])
    .index("by_nfcId", ["nfcId"])
    .index("by_chefId", ["chefId"]),

  // ── Chefs ─────────────────────────────────────────────────────────────
  chefs: defineTable({
    name: v.string(),
    handle: v.string(),
    cuisine: v.string(),
    region: v.string(),
    isVerified: v.boolean(),
    verificationStatus: v.union(
      v.literal("PENDING_REVIEW"),
      v.literal("VERIFIED"),
      v.literal("REJECTED"),
    ),
    rating: v.number(),
    totalDrops: v.number(),
    successfulDrops: v.number(),
    points: v.number(),
    rank: v.number(),
    walletBalance: v.number(),
    isFeatured: v.optional(v.boolean()),
    isPinned: v.optional(v.boolean()),
    foodBadgeUploadId: v.optional(v.id("uploads")),
    nationalIdUploadId: v.optional(v.id("uploads")),
    rejectionReason: v.optional(v.string()),
    submittedAt: v.optional(v.number()),
  })
    .index("by_verified", ["isVerified"])
    .index("by_verificationStatus", ["verificationStatus"]),

  // ── Admin manual wallet credits — audit ledger ───────────────────────
  adminCredits: defineTable({
    chefId: v.id("chefs"),
    amount: v.number(),
    note: v.string(),
    idempotencyKey: v.optional(v.string()),
  })
    .index("by_chefId", ["chefId"])
    .index("by_idempotencyKey", ["idempotencyKey"]),

  // ── Drops (replaces (:Chef)-[:POSTED]->(:Drop)) ─────────────────────
  drops: defineTable({
    chefId: v.id("chefs"),
    title: v.string(),
    description: v.string(),
    mealSlot: v.string(),
    price: v.number(),
    inventory: v.number(),
    minOrders: v.number(),
    currentOrders: v.number(),
    status: v.union(
      v.literal("ACTIVE"),
      v.literal("SOLD_OUT"),
      v.literal("EXPIRED"),
      v.literal("CANCELLED"),
    ),
    pickupLocation: v.string(),
    // Denormalized from the selected Spot so the buyer feed/map link never
    // needs a second query hop — set at creation time, immutable after.
    locationId: v.optional(v.id("locations")),
    pickupLat: v.optional(v.number()),
    pickupLng: v.optional(v.number()),
    expiresAt: v.number(), // epoch ms
    imageIndex: v.number(),
    tags: v.array(v.string()),
    chefEarnings: v.optional(v.number()),
    isSecret: v.optional(v.boolean()),
    isFeatured: v.optional(v.boolean()),
  })
    .index("by_chefId", ["chefId"])
    .index("by_status", ["status"])
    .index("by_mealSlot", ["mealSlot"])
    .index("by_expiresAt", ["expiresAt"])
    .index("by_isSecret", ["isSecret"]),

  // ── Orders (replaces (:User)-[:PLACED]->(:Order)-[:FOR]->(:Drop)) ──
  orders: defineTable({
    // Not v.id("users") — guest checkout stores a server-signed "anon_..."
    // string identity here instead of a real user document.
    userId: v.string(),
    dropId: v.id("drops"),
    chefId: v.id("chefs"),
    price: v.number(),
    effectivePrice: v.number(),
    status: v.union(
      v.literal("PENDING"),
      v.literal("CONFIRMED"),
      v.literal("FULFILLED"),
      v.literal("CANCELLED"),
    ),
    isMemberOrder: v.boolean(),
    paymentMethod: v.union(v.literal("DIGITAL"), v.literal("CASH")),
    escrowStatus: v.union(
      v.literal("HELD"),
      v.literal("RELEASED"),
      v.literal("REFUNDED"),
      v.literal("CASH"),
      v.literal("CASH_RECONCILED"),
      v.literal("CANCELLED"),
    ),
    pickupToken: v.string(),
    idempotencyKey: v.optional(v.string()), // dedupe retried order submits
    chefShare: v.optional(v.number()),
    platformShare: v.optional(v.number()),
    cashCollected: v.optional(v.number()),
    fulfilledAt: v.optional(v.number()),
  })
    .index("by_userId", ["userId"])
    .index("by_dropId", ["dropId"])
    .index("by_chefId", ["chefId"])
    .index("by_status", ["status"])
    .index("by_pickupToken", ["pickupToken"])
    .index("by_idempotencyKey", ["idempotencyKey"]),

  // ── Favorites (replaces (:User)-[:FAVORITED]->(:Chef)) ──────────────
  favorites: defineTable({
    userId: v.id("users"),
    chefId: v.id("chefs"),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_chefId", ["userId", "chefId"]),

  // ── Subscriptions (Club Pass) ────────────────────────────────────────
  subscriptions: defineTable({
    userId: v.id("users"),
    tier: v.string(),
    status: v.union(v.literal("ACTIVE"), v.literal("CANCELLED")),
    price: v.number(),
    stripeCustomerId: v.optional(v.string()),
    startedAt: v.number(),
    expiresAt: v.number(),
    cancelledAt: v.optional(v.number()),
  })
    .index("by_userId", ["userId"])
    .index("by_status", ["status"]),

  // ── Locations (named pickup spots) ────────────────────────────────────
  locations: defineTable({
    name: v.string(),
    address: v.string(),
    region: v.string(),
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
    isPinnable: v.boolean(),
    nfcId: v.optional(v.string()),
  })
    .index("by_nfcId", ["nfcId"])
    .index("by_region", ["region"]),

  // ── Chef ↔ Location pins (permanent presence at a spot) ───────────────
  locationPins: defineTable({
    locationId: v.id("locations"),
    chefId: v.id("chefs"),
  })
    .index("by_locationId", ["locationId"])
    .index("by_chefId", ["chefId"]),

  // ── Uploads — Convex native file storage (storageId) + ownership ─────
  uploads: defineTable({
    userId: v.id("users"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.string(),
  }).index("by_userId", ["userId"]).index("by_storageId", ["storageId"]),

  // ── Platform config — single row, replaces (:Config {id:'platform'}) ─
  config: defineTable({
    key: v.literal("platform"),
    platformFeeRate: v.number(),
    memberDiscountRate: v.number(),
    markupRate: v.number(),
    clubPassPrice: v.number(),
    walletFreezeThreshold: v.number(),
  }).index("by_key", ["key"]),
});
