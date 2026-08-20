/**
 * Neo4j schema bootstrap — idempotent.
 *
 * Graph model:
 *   (:User   {id, name, handle, nfcId, tier, points, createdAt})
 *   (:Chef   {id, name, handle, cuisine, region, isVerified, rating,
 *             totalDrops, successfulDrops, points, rank, createdAt})
 *   (:Drop   {id, title, description, mealSlot, price, inventory, minOrders,
 *             currentOrders, status, pickupLocation, expiresAt,
 *             imageIndex, tags, createdAt, chefEarnings})
 *   (:Order  {id, price, effectivePrice, status, orderedAt, isMemberOrder})
 *   (:Subscription {id, userId, tier, status, startedAt, expiresAt})
 *   (:Config {id: 'platform', platformFeeRate, memberDiscountRate, markupRate})
 *
 *   (:Chef)-[:POSTED]->(:Drop)
 *   (:Drop)-[:BELONGS_TO]->(:Chef)
 *   (:User)-[:PLACED]->(:Order)-[:FOR]->(:Drop)
 *   (:User)-[:HAS_SUBSCRIPTION]->(:Subscription)
 */
import crypto from "node:crypto";
import {
  DEFAULT_PLATFORM_FEE_RATE,
  DEFAULT_MEMBER_DISCOUNT,
  DEFAULT_WALLET_FREEZE_THRESHOLD,
} from "./threshold";
import { runWrite } from "./neo4j";
import { logger } from "./logger";

const CONSTRAINTS = [
  { name: "user_id_unique",         cypher: "CREATE CONSTRAINT user_id_unique IF NOT EXISTS FOR (u:User) REQUIRE u.id IS UNIQUE" },
  { name: "chef_id_unique",         cypher: "CREATE CONSTRAINT chef_id_unique IF NOT EXISTS FOR (c:Chef) REQUIRE c.id IS UNIQUE" },
  { name: "drop_id_unique",         cypher: "CREATE CONSTRAINT drop_id_unique IF NOT EXISTS FOR (d:Drop) REQUIRE d.id IS UNIQUE" },
  { name: "order_id_unique",        cypher: "CREATE CONSTRAINT order_id_unique IF NOT EXISTS FOR (o:Order) REQUIRE o.id IS UNIQUE" },
  { name: "subscription_id_unique", cypher: "CREATE CONSTRAINT subscription_id_unique IF NOT EXISTS FOR (s:Subscription) REQUIRE s.id IS UNIQUE" },
  { name: "config_id_unique",       cypher: "CREATE CONSTRAINT config_id_unique IF NOT EXISTS FOR (cfg:Config) REQUIRE cfg.id IS UNIQUE" },
  { name: "location_id_unique",     cypher: "CREATE CONSTRAINT location_id_unique IF NOT EXISTS FOR (l:Location) REQUIRE l.id IS UNIQUE" },
];

const INDEXES = [
  { name: "drop_status_idx",       cypher: "CREATE INDEX drop_status_idx IF NOT EXISTS FOR (d:Drop) ON (d.status)" },
  { name: "drop_mealslot_idx",     cypher: "CREATE INDEX drop_mealslot_idx IF NOT EXISTS FOR (d:Drop) ON (d.mealSlot)" },
  { name: "drop_expires_idx",      cypher: "CREATE INDEX drop_expires_idx IF NOT EXISTS FOR (d:Drop) ON (d.expiresAt)" },
  { name: "drop_secret_idx",       cypher: "CREATE INDEX drop_secret_idx IF NOT EXISTS FOR (d:Drop) ON (d.isSecret)" },
  { name: "chef_verified_idx",     cypher: "CREATE INDEX chef_verified_idx IF NOT EXISTS FOR (c:Chef) ON (c.isVerified)" },
  { name: "order_status_idx",      cypher: "CREATE INDEX order_status_idx IF NOT EXISTS FOR (o:Order) ON (o.status)" },
  { name: "subscription_user_idx", cypher: "CREATE INDEX subscription_user_idx IF NOT EXISTS FOR (s:Subscription) ON (s.userId)" },
  { name: "subscription_status_idx", cypher: "CREATE INDEX subscription_status_idx IF NOT EXISTS FOR (s:Subscription) ON (s.status)" },
  { name: "location_region_idx",    cypher: "CREATE INDEX location_region_idx IF NOT EXISTS FOR (l:Location) ON (l.region)" },
  { name: "location_nfc_idx",       cypher: "CREATE INDEX location_nfc_idx IF NOT EXISTS FOR (l:Location) ON (l.nfcId)" },
  { name: "user_nfc_idx",           cypher: "CREATE INDEX user_nfc_idx IF NOT EXISTS FOR (u:User) ON (u.nfcId)" },
];

const CHEF_SEEDS = [
  { id: "chef1", name: "Chef Marcus St. James", handle: "@marcusdrops", cuisine: "Trinidadian Fusion",  region: "Port of Spain", isVerified: true,  verificationStatus: "VERIFIED",        rating: 4.9, totalDrops: 23, successfulDrops: 21, points: 12840, rank: 1 },
  { id: "chef2", name: "Chef Simone Baptiste",  handle: "@simoneeats",  cuisine: "Caribbean Fine Dining", region: "San Fernando", isVerified: true,  verificationStatus: "VERIFIED",        rating: 4.8, totalDrops: 18, successfulDrops: 16, points: 10250, rank: 2 },
  { id: "chef3", name: "Chef Anya Ramdeen",     handle: "@anyasecret",  cuisine: "Indo-Trini",          region: "Chaguanas",    isVerified: true,  verificationStatus: "VERIFIED",        rating: 4.7, totalDrops: 15, successfulDrops: 13, points: 8900,  rank: 3 },
  { id: "chef4", name: "Chef Ricardo Mose",     handle: "@ricardofire", cuisine: "BBQ & Smoke",         region: "Diego Martin", isVerified: false, verificationStatus: "PENDING_REVIEW",  rating: 4.6, totalDrops: 12, successfulDrops: 10, points: 7200,  rank: 4 },
  { id: "chef5", name: "Chef Kamau Joseph",     handle: "@kamaustreet", cuisine: "Street Food Elite",   region: "Arima",        isVerified: true,  verificationStatus: "VERIFIED",        rating: 4.5, totalDrops: 11, successfulDrops: 9,  points: 6100,  rank: 5 },
  // Dev seed: pending review chef for testing the admin queue
  { id: "chef_pending_dev", name: "Chef Aaliya Hosein", handle: "@aaliyacooks", cuisine: "East Indian Street", region: "Couva", isVerified: false, verificationStatus: "PENDING_REVIEW", rating: 0, totalDrops: 0, successfulDrops: 0, points: 0, rank: 999 },
];

/** Launch drops — seeded once. Inventory = hard plate limit. */
const DROP_SEEDS = [
  {
    id: "drop1", chefId: "chef1",
    title: "Braised Oxtail Perfection",
    description: "Slow-braised for 8 hours in a secret blend of Trinidad spices. Served with butter rice and fried plantain. The oxtail falls off the bone into a rich, dark gravy that has been building flavour all day. This is the kind of meal that makes you go quiet at the table. Limited to tonight only — once the batch fills, the drop locks.",
    mealSlot: "Dinner", price: 45, inventory: 25, minOrders: 15,
    pickupLocation: "Port of Spain, Queen's Park Savannah", imageIndex: 1,
    tags: ["Exclusive", "Tonight Only"],
    expiresHoursFromNow: 3.5,
  },
  {
    id: "drop2", chefId: "chef2",
    title: "Crab Back Roti Special",
    description: "Whole crab back stuffed with curried crab filling, wrapped in freshly made dhalpuri roti. A cultural experience on a plate. Chef Simone sources her crabs fresh from the Caroni daily. The curry is a three-hour labour built from scratch — no shortcuts, no regrets.",
    mealSlot: "Lunch", price: 55, inventory: 20, minOrders: 10,
    pickupLocation: "San Fernando, High Street", imageIndex: 2,
    tags: ["Signature", "Seafood"],
    expiresHoursFromNow: 6,
  },
  {
    id: "drop3", chefId: "chef3",
    title: "Coconut Pelau x Stew Chicken",
    description: "Classic Trini pelau made with coconut milk, pigeon peas, and fall-off-the-bone stew chicken. Comfort food elevated to something you will think about for weeks. Anya uses her grandmother's hand-ground green seasoning — the real stuff, not the bottle.",
    mealSlot: "Dinner", price: 28, inventory: 30, minOrders: 20,
    pickupLocation: "Chaguanas, Market Square", imageIndex: 3,
    tags: ["Almost Full", "Classic"],
    expiresHoursFromNow: 1.2,
  },
  {
    id: "drop4", chefId: "chef4",
    title: "Butter Lobster Pasta Fusion",
    description: "Fresh Caribbean lobster in a saffron-butter cream sauce over house-made pasta. Fine dining brought to your door. Ricardo sources his lobster live from the Gulf of Paria at 5am and the pasta is rolled to order. This is not a restaurant dish — this is a chef cooking for people he respects.",
    mealSlot: "Dinner", price: 75, inventory: 12, minOrders: 8,
    pickupLocation: "Diego Martin, Library Junction", imageIndex: 1,
    tags: ["Premium", "Seafood"],
    expiresHoursFromNow: 4,
  },
  {
    id: "drop5", chefId: "chef5",
    title: "Doubles & Doubles Only",
    description: "The best doubles in the city — bara fried to order, pepper sauce made fresh each morning, shadow beni chutney that will change your life. Kamau has been perfecting this recipe for 9 years. Pure gold wrapped in bara. This is what Friday morning tastes like in Trinidad.",
    mealSlot: "Breakfast", price: 15, inventory: 50, minOrders: 25,
    pickupLocation: "Arima, Market Drive", imageIndex: 2,
    tags: ["Community Fave", "Vegan"],
    expiresHoursFromNow: 8,
  },
];

export async function initSchema(): Promise<void> {
  logger.info("Initialising Neo4j schema…");

  for (const { name, cypher } of CONSTRAINTS) {
    try { await runWrite(cypher); logger.info({ name }, "Constraint applied"); }
    catch (err: any) { if (!err?.message?.includes("already exists")) logger.warn({ name, err: err.message }, "Constraint warning"); }
  }

  for (const { name, cypher } of INDEXES) {
    try { await runWrite(cypher); logger.info({ name }, "Index applied"); }
    catch (err: any) { if (!err?.message?.includes("already exists")) logger.warn({ name, err: err.message }, "Index warning"); }
  }

  // Platform config defaults — values come from the exported DEFAULT_* constants
  // in lib/threshold.ts so there is a single source of truth.
  await runWrite(
    `MERGE (cfg:Config {id: 'platform'})
     ON CREATE SET
       cfg.platformFeeRate        = $feeRate,
       cfg.memberDiscountRate     = $discountRate,
       cfg.markupRate             = 0.0,
       cfg.clubPassPrice          = 5.00,
       cfg.walletFreezeThreshold  = $freezeThreshold,
       cfg.createdAt              = datetime()
     ON MATCH SET
       cfg.walletFreezeThreshold  = coalesce(cfg.walletFreezeThreshold, $freezeThreshold)`,
    {
      feeRate: DEFAULT_PLATFORM_FEE_RATE,
      discountRate: DEFAULT_MEMBER_DISCOUNT,
      freezeThreshold: DEFAULT_WALLET_FREEZE_THRESHOLD,
    }
  );

  // Seed chefs
  for (const chef of CHEF_SEEDS) {
    await runWrite(
      `MERGE (c:Chef {id: $id})
       ON CREATE SET
         c.name = $name, c.handle = $handle, c.cuisine = $cuisine,
         c.region = $region, c.isVerified = $isVerified,
         c.verificationStatus = $verificationStatus,
         c.rating = $rating,
         c.totalDrops = $totalDrops, c.successfulDrops = $successfulDrops,
         c.points = $points, c.rank = $rank, c.createdAt = datetime()
       ON MATCH SET
         c.verificationStatus = coalesce(c.verificationStatus, $verificationStatus)`,
      chef as any
    );
  }

  // Seed launch drops (idempotent — won't overwrite existing orders/status)
  const nowMs = Date.now();
  for (const drop of DROP_SEEDS) {
    const expiresAt = new Date(nowMs + drop.expiresHoursFromNow * 3_600_000).toISOString();
    await runWrite(
      `MATCH (c:Chef {id: $chefId})
       MERGE (d:Drop {id: $id})
       ON CREATE SET
         d.title          = $title,
         d.description    = $description,
         d.mealSlot       = $mealSlot,
         d.price          = $price,
         d.inventory      = $inventory,
         d.minOrders      = $minOrders,
         d.currentOrders  = 0,
         d.status         = 'ACTIVE',
         d.pickupLocation = $pickupLocation,
         d.expiresAt      = datetime($expiresAt),
         d.imageIndex     = $imageIndex,
         d.tags           = $tags,
         d.chefEarnings   = null,
         d.createdAt      = datetime()
       MERGE (c)-[:POSTED]->(d)
       MERGE (d)-[:BELONGS_TO]->(c)`,
      {
        chefId: drop.chefId, id: drop.id, title: drop.title,
        description: drop.description, mealSlot: drop.mealSlot,
        price: drop.price, inventory: drop.inventory, minOrders: drop.minOrders,
        pickupLocation: drop.pickupLocation, expiresAt,
        imageIndex: drop.imageIndex, tags: drop.tags,
      }
    );
  }

  // Migration: repair stale drops from the pre-inventory model
  await runWrite(
    `MATCH (d:Drop)
     WHERE d.inventory IS NULL OR d.status = 'PENDING'
     SET d.inventory = coalesce(d.inventory, coalesce(d.minOrders, 20) + 10),
         d.status = CASE WHEN d.status = 'PENDING' THEN 'ACTIVE' ELSE d.status END,
         d.currentOrders = coalesce(d.currentOrders, 0)`
  );

  // Migration: backfill escrow fields on legacy orders
  await runWrite(
    `MATCH (o:Order)
     WHERE o.escrowStatus IS NULL AND o.status IN ['PENDING', 'CONFIRMED']
     SET o.escrowStatus = 'HELD',
         o.pickupToken = coalesce(o.pickupToken,
           'FFC-' + toUpper(substring(randomUUID(), 0, 8)) + '-' + toUpper(substring(randomUUID(), 24, 4)))`
  );

  // Migration: backfill paymentMethod on legacy orders (all existing orders are digital)
  await runWrite(
    `MATCH (o:Order)
     WHERE o.paymentMethod IS NULL
     SET o.paymentMethod = 'DIGITAL'`
  );

  // Migration: ensure chef walletBalance exists (some seeded chefs may not have it)
  await runWrite(
    `MATCH (c:Chef)
     WHERE c.walletBalance IS NULL
     SET c.walletBalance = 0.0`
  );

  // Migration: backfill verificationStatus on existing chefs
  await runWrite(
    `MATCH (c:Chef)
     WHERE c.verificationStatus IS NULL
     SET c.verificationStatus = CASE WHEN c.isVerified = true THEN 'VERIFIED' ELSE 'PENDING_REVIEW' END`
  );

  // Migration: enforce role invariant — linked Users must be BUYER unless their
  // Chef is VERIFIED. Demotes any User whose Chef is PENDING_REVIEW or REJECTED.
  await runWrite(
    `MATCH (u:User)-[:IS_CHEF]->(c:Chef)
     WHERE u.role = 'CHEF' AND c.verificationStatus <> 'VERIFIED'
     SET u.role = 'BUYER'`
  );

  // Seed demo accounts (development only — never in production)
  if (process.env["NODE_ENV"] === "production") {
    logger.info("Neo4j schema initialisation complete (demo seeds skipped in production)");
    return;
  }
  const seedAccounts = [
    { id: "user_admin",       name: "Platform Admin",       email: "kingtay2632205@gmail.com", role: "ADMIN", password: "2205263",  area: "Port of Spain", chefId: null },
    { id: "user_chef1",       name: "Chef Marcus St. James", email: "marcus@fridayfood.club", role: "CHEF",  password: "chef123", area: "Port of Spain", chefId: "chef1" },
    { id: "user_buyer1",      name: "Demo Buyer",            email: "buyer@fridayfood.club",  role: "BUYER", password: "buyer123", area: "Woodbrook",    chefId: null },
    // Dev-only pending chef for testing the admin verification queue.
    // role is BUYER — chef status is PENDING_REVIEW; role only becomes CHEF after admin approval.
    { id: "user_chef_pending", name: "Chef Aaliya Hosein",  email: "aaliya@fridayfood.club",  role: "BUYER", password: "chef123", area: "Couva",         chefId: "chef_pending_dev" },
  ];
  for (const acc of seedAccounts) {
    const salt = crypto.randomBytes(16).toString("hex");
    const passwordHash = `${salt}:${crypto.scryptSync(acc.password, salt, 64).toString("hex")}`;
    await runWrite(
      `MERGE (u:User {email: $email})
       ON CREATE SET u.id = $id, u.name = $name, u.passwordHash = $passwordHash,
         u.role = $role, u.area = $area, u.walletBalance = 0.0, u.points = 0,
         u.handle = '@' + toLower(replace($name, ' ', '')), u.createdAt = datetime()`,
      { id: acc.id, name: acc.name, email: acc.email, passwordHash, role: acc.role, area: acc.area }
    );
    if (acc.chefId) {
      await runWrite(
        `MATCH (u:User {email: $email}), (c:Chef {id: $chefId})
         MERGE (u)-[:IS_CHEF]->(c)`,
        { email: acc.email, chefId: acc.chefId }
      );
    }
  }

  logger.info("Neo4j schema initialisation complete");
}
