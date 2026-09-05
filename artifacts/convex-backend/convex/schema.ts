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

  // ── Dishes — a chef's permanent menu. A Drop is one time-boxed sale of
  // a Dish; the Dish itself persists after the drop closes so "gone" only
  // ever means this batch, not the recipe. ───────────────────────────────
  dishes: defineTable({
    chefId: v.id("chefs"),
    title: v.string(),
    description: v.string(),
    mealSlot: v.string(),
    imageIndex: v.number(),
    tags: v.array(v.string()),
    timesDropped: v.number(),
    loveCount: v.number(),
    lastDroppedAt: v.number(),
  })
    .index("by_chefId", ["chefId"])
    .index("by_chefId_title", ["chefId", "title"]),

  // ── Dish loves — a subscribed member's vote to see a dish come back.
  // Gated: only Club Pass members who've actually pre-ordered the dish
  // at least once may love it (see dishes.toggleLove). ──────────────────
  dishLoves: defineTable({
    dishId: v.id("dishes"),
    userId: v.id("users"),
  })
    .index("by_dishId", ["dishId"])
    .index("by_dishId_userId", ["dishId", "userId"])
    .index("by_userId", ["userId"]),

  // ── Drops (replaces (:Chef)-[:POSTED]->(:Drop)) ─────────────────────
  drops: defineTable({
    chefId: v.id("chefs"),
    dishId: v.optional(v.id("dishes")),
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
    // Self-serve chef boost expires; admin-toggled features (CurationPanel)
    // leave this unset, so they never lapse on their own.
    featuredUntil: v.optional(v.number()),
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
      v.literal("PENDING_PAYMENT"),
      v.literal("HELD"),
      v.literal("RELEASED"),
      v.literal("REFUNDED"),
      v.literal("CASH"),
      v.literal("CASH_RECONCILED"),
      v.literal("PAYMENT_FAILED"),
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
    status: v.union(v.literal("PENDING_PAYMENT"), v.literal("ACTIVE"), v.literal("CANCELLED")),
    price: v.number(),
    stripeCustomerId: v.optional(v.string()),
    paymentId: v.optional(v.id("paymentTransactions")),
    startedAt: v.number(),
    expiresAt: v.number(),
    cancelledAt: v.optional(v.number()),
  })
    .index("by_userId", ["userId"])
    .index("by_status", ["status"]),

  // ── WiPay transaction ledger ─────────────────────────────────────────
  // Provider state is kept separate from fulfillment state. A successful
  // browser redirect is never enough to mark an order paid; only the signed
  // webhook may move a transaction to PAID.
  paymentTransactions: defineTable({
    kind: v.union(v.literal("ORDER"), v.literal("CLUB_PASS")),
    orderId: v.optional(v.id("orders")),
    subscriptionId: v.optional(v.id("subscriptions")),
    userId: v.string(),
    provider: v.literal("WIPAY"),
    providerReference: v.optional(v.string()),
    amount: v.number(),
    currency: v.literal("TTD"),
    status: v.union(
      v.literal("INITIATED"),
      v.literal("PENDING"),
      v.literal("PAID"),
      v.literal("FAILED"),
      v.literal("REFUNDED"),
    ),
    checkoutUrl: v.optional(v.string()),
    rawStatus: v.optional(v.string()),
    refundRequired: v.optional(v.boolean()),
    idempotencyKey: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_orderId", ["orderId"])
    .index("by_subscriptionId", ["subscriptionId"])
    .index("by_providerReference", ["providerReference"])
    .index("by_idempotencyKey", ["idempotencyKey"]),

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

  // ── Pre-launch waitlist — buyers or chefs who want to be notified when
  // there's real demand, before the app is publicly live. ────────────────
  waitlist: defineTable({
    name: v.string(),
    contact: v.string(), // phone or email, whatever they gave
    role: v.union(v.literal("BUYER"), v.literal("CHEF")),
    area: v.optional(v.string()),
    notes: v.optional(v.string()),
  })
    .index("by_role", ["role"]),

  // ── Platform config — single row, replaces (:Config {id:'platform'}) ─
  config: defineTable({
    key: v.literal("platform"),
    platformFeeRate: v.number(),
    memberDiscountRate: v.number(),
    markupRate: v.number(),
    clubPassPrice: v.number(),
    walletFreezeThreshold: v.number(),
    boostPrice: v.optional(v.number()),
    noShowPenalty: v.optional(v.number()),
  }).index("by_key", ["key"]),
});
