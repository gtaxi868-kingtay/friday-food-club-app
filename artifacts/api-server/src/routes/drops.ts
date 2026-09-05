/**
 * Drops API
 *
 * GET  /api/drops                — list active drops (filter: mealSlot, status)
 * GET  /api/drops/:id            — single drop with full chef relationship
 * GET  /api/drops/:id/photo      — publicly proxy the chef-uploaded drop photo
 * POST /api/drops                — chef creates a new drop
 * PATCH /api/drops/:id           — chef updates a draft drop (pre-launch only)
 */
import { Readable } from "stream";
import { Router } from "express";
import { z } from "zod";
import neo4j from "neo4j-driver";
import { runRead, runWrite, toNumber } from "../lib/neo4j";
import { requireAuth, requireVerifiedChef, getSession, type SessionUser } from "./auth";
import { logger } from "../lib/logger";
import {
  DEFAULT_WALLET_FREEZE_THRESHOLD,
  DEFAULT_MEMBER_DISCOUNT,
} from "../lib/threshold";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";

const router = Router();
const objectStorageService = new ObjectStorageService();

const MealSlot = z.enum(["Breakfast", "Lunch", "Dinner"]);
const DropStatus = z.enum(["ACTIVE", "UNLOCKED", "SOLD_OUT", "COMPLETED", "CANCELLED"]);

const CreateDropSchema = z.object({
  chefId:          z.string().min(1),
  title:           z.string().min(3).max(120),
  description:     z.string().min(10).max(2000),
  mealSlot:        MealSlot,
  price:           z.number().positive(),
  inventory:       z.number().int().min(1).max(500),   // hard plate limit
  minOrders:       z.number().int().min(1).max(500),   // payout threshold (≤ inventory)
  pickupLocation:  z.string().min(3).max(200),
  expiresAt:       z.string().datetime(),
  imageIndex:      z.number().int().min(1).max(3).default(1),
  imageUrl:        z.string().max(500).optional().nullable(), // chef-uploaded food photo path
  tags:            z.array(z.string()).max(5).default([]),
  isSecret:        z.boolean().default(false), // secret drops: only orderable on Fridays
});

const UpdateDropSchema = z.object({
  title:           z.string().min(3).max(120).optional(),
  description:     z.string().min(10).max(2000).optional(),
  price:           z.number().positive().optional(),
  inventory:       z.number().int().min(1).max(500).optional(),
  minOrders:       z.number().int().min(1).max(500).optional(),
  pickupLocation:  z.string().min(3).max(200).optional(),
  expiresAt:       z.string().datetime().optional(),
  tags:            z.array(z.string()).max(5).optional(),
});

// ── GET /api/drops/platform-config ───────────────────────────────────────────
// Public endpoint — exposes only the fields the mobile app needs without auth.

router.get("/platform-config", async (_req, res) => {
  try {
    const rows = await runRead<{ walletFreezeThreshold: unknown; clubPassPrice: unknown }>(
      `OPTIONAL MATCH (cfg:Config {id: 'platform'})
       RETURN coalesce(cfg.walletFreezeThreshold, $freezeThreshold) AS walletFreezeThreshold,
              coalesce(cfg.clubPassPrice, 5.0)            AS clubPassPrice`,
      { freezeThreshold: DEFAULT_WALLET_FREEZE_THRESHOLD }
    );
    const threshold    = toNumber(rows[0]?.walletFreezeThreshold ?? DEFAULT_WALLET_FREEZE_THRESHOLD);
    const clubPassPrice = toNumber(rows[0]?.clubPassPrice ?? 5);
    return res.json({ walletFreezeThreshold: threshold, clubPassPrice });
  } catch (err) {
    logger.error({ err }, "GET /api/drops/platform-config failed");
    return res.json({ walletFreezeThreshold: DEFAULT_WALLET_FREEZE_THRESHOLD, clubPassPrice: 5 }); // safe fallback
  }
});

// ── GET /api/drops ───────────────────────────────────────────────────────────

router.get("/", async (req, res) => {
  try {
    const mealSlot    = req.query["mealSlot"]  as string | undefined;
    const statusParam = (req.query["status"]   as string | undefined) ?? "ACTIVE,UNLOCKED";
    const statuses    = statusParam.split(",").map(s => s.trim().toUpperCase());
    const chefId      = req.query["chefId"]    as string | undefined;
    const area        = req.query["area"]      as string | undefined;
    const latRaw      = req.query["lat"]       as string | undefined;
    const lonRaw      = req.query["lon"]       as string | undefined;
    const radiusRaw   = req.query["radius"]    as string | undefined;   // metres
    const cursor      = req.query["cursor"]    as string | undefined;
    const limitRaw    = Number.parseInt((req.query["limit"] as string | undefined) ?? "30", 10);
    const limit        = neo4j.int(Number.isFinite(limitRaw) ? Math.max(1, Math.min(50, limitRaw)) : 30);

    const lat    = latRaw    != null ? parseFloat(latRaw)    : null;
    const lon    = lonRaw    != null ? parseFloat(lonRaw)    : null;
    const radius = radiusRaw != null ? parseFloat(radiusRaw) : null;
    const hasGps = lat != null && lon != null && !Number.isNaN(lat) && !Number.isNaN(lon);

    const params: Record<string, unknown> = { statuses, cursor: cursor || null, limit };
    const extraFilters: string[] = [];

    if (mealSlot && MealSlot.safeParse(mealSlot).success) {
      extraFilters.push("AND d.mealSlot = $mealSlot");
      params["mealSlot"] = mealSlot;
    }
    if (chefId) {
      extraFilters.push("AND c.id = $chefId");
      params["chefId"] = chefId;
    }

    // GPS-based proximity sort: when lat/lon provided, compute distance from
    // chef's stored coordinates using Neo4j spatial point.distance().
    // Falls back to string-area proximity rank when no GPS is available.
    let records: Record<string, unknown>[];

    if (hasGps) {
      params["lat"]    = lat;
      params["lon"]    = lon;
      params["radius"] = radius != null && !Number.isNaN(radius) ? radius : null;

      records = await runRead<Record<string, unknown>>(
        `WITH point({latitude: $lat, longitude: $lon}) AS userPoint
         MATCH (c:Chef)-[:POSTED]->(d:Drop)
         WHERE d.status IN $statuses
           AND d.expiresAt > datetime()
            AND ($cursor IS NULL OR d.expiresAt > datetime($cursor))
           ${extraFilters.join(" ")}
         WITH d, c, userPoint,
              CASE WHEN c.lat IS NOT NULL AND c.lon IS NOT NULL
                THEN point.distance(point({latitude: c.lat, longitude: c.lon}), userPoint)
                ELSE 999999
              END AS distMeters
         WHERE $radius IS NULL OR distMeters <= $radius
         RETURN
           d.id             AS id,
           d.title          AS title,
           d.description    AS description,
           d.mealSlot       AS mealSlot,
           d.price          AS price,
           d.inventory      AS inventory,
           d.minOrders      AS minOrders,
           d.currentOrders  AS currentOrders,
           d.status         AS status,
           d.pickupLocation AS pickupLocation,
           d.expiresAt      AS expiresAt,
           d.imageIndex     AS imageIndex,
           d.imageUrl       AS imageUrl,
           d.tags           AS tags,
           d.createdAt      AS createdAt,
           coalesce(d.isSecret, false) AS isSecret,
           {
             id: c.id, name: c.name, handle: c.handle,
             cuisine: c.cuisine, region: c.region, isVerified: c.isVerified,
             rating: c.rating, totalDrops: c.totalDrops,
             successfulDrops: c.successfulDrops, points: c.points, rank: c.rank
           } AS chef,
           distMeters        AS distMeters
          ORDER BY coalesce(d.isFeatured, false) DESC, distMeters ASC, d.expiresAt ASC
          LIMIT $limit`,
        params
      );

      const drops = records.map(r => {
        const { distMeters, ...rest } = r;
        const dm = toNumber(distMeters);
        return { ...normalise(rest), distanceMetres: dm < 999999 ? dm : null, isNearby: dm < 999999 };
      });
       const lastDrop = drops[drops.length - 1] as { expiresAt?: unknown } | undefined;
       return res.json({
         drops,
         total: drops.length,
         nextCursor: drops.length === Number(limit.toString()) ? String(lastDrop?.expiresAt ?? '') || null : null,
       });
    }

    // No GPS — fall back to string-area proximity ranking
    records = await runRead<Record<string, unknown>>(
      `MATCH (c:Chef)-[:POSTED]->(d:Drop)
       WHERE d.status IN $statuses
         AND d.expiresAt > datetime()
         AND ($cursor IS NULL OR d.expiresAt > datetime($cursor))
         ${extraFilters.join(" ")}
       RETURN
         d.id             AS id,
         d.title          AS title,
         d.description    AS description,
         d.mealSlot       AS mealSlot,
         d.price          AS price,
         d.inventory      AS inventory,
         d.minOrders      AS minOrders,
         d.currentOrders  AS currentOrders,
         d.status         AS status,
         d.pickupLocation AS pickupLocation,
         d.expiresAt      AS expiresAt,
         d.imageIndex     AS imageIndex,
         d.imageUrl       AS imageUrl,
         d.tags           AS tags,
         d.createdAt      AS createdAt,
         coalesce(d.isSecret, false) AS isSecret,
         {
           id: c.id, name: c.name, handle: c.handle,
           cuisine: c.cuisine, region: c.region, isVerified: c.isVerified,
           rating: c.rating, totalDrops: c.totalDrops,
           successfulDrops: c.successfulDrops, points: c.points, rank: c.rank
         } AS chef,
         CASE
           WHEN $area IS NOT NULL AND (
             toLower(d.pickupLocation) CONTAINS toLower($area)
             OR toLower(coalesce(c.region, '')) CONTAINS toLower($area)
           ) THEN 0 ELSE 1
         END AS proximityRank
       ORDER BY coalesce(d.isFeatured, false) DESC, proximityRank ASC, d.expiresAt ASC
       LIMIT $limit`,
      { ...params, area: area ?? null }
    );

    const drops = records.map(r => {
      const { proximityRank, ...rest } = r;
      return { ...normalise(rest), isNearby: area ? toNumber(proximityRank) === 0 : false };
    });
     const lastDrop = drops[drops.length - 1] as { expiresAt?: unknown } | undefined;
     return res.json({
       drops,
       total: drops.length,
        nextCursor: drops.length === Number(limit.toString()) ? String(lastDrop?.expiresAt ?? '') || null : null,
     });
  } catch (err) {
    logger.error({ err }, "GET /api/drops failed");
    return res.status(500).json({ error: "Failed to fetch drops" });
  }
});

// ── GET /api/drops/:id ───────────────────────────────────────────────────────

router.get("/:id", async (req, res) => {
  try {
    const session = getSession(req);

    const records = await runRead<Record<string, unknown>>(
      `MATCH (c:Chef)-[:POSTED]->(d:Drop {id: $id})
       RETURN
         d.id, d.title, d.description, d.mealSlot, d.price,
         d.inventory, d.minOrders, d.currentOrders, d.status,
         d.pickupLocation, d.expiresAt, d.imageIndex, d.imageUrl, d.tags,
         d.createdAt, d.soldOutAt, d.unlockedAt,
         coalesce(d.isSecret, false) AS isSecret,
         {
           id: c.id, name: c.name, handle: c.handle,
           cuisine: c.cuisine, region: c.region, isVerified: c.isVerified,
           rating: c.rating, totalDrops: c.totalDrops,
           successfulDrops: c.successfulDrops, points: c.points, rank: c.rank
         } AS chef`,
      { id: req.params["id"] }
    );

    if (records.length === 0) return res.status(404).json({ error: "Drop not found" });

    // Flatten Neo4j key names (e.g. "d.id" → "id")
    const raw = records[0]!;
    const flat: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) {
      const key = k.includes(".") ? k.split(".")[1]! : k;
      flat[key] = v;
    }

    const result = normalise(flat);

    // If the requesting user has an active Club Pass, compute and expose the
    // original (pre-discount) price so the mobile app can show exact savings.
    if (session) {
      const memberRows = await runRead<{ isMember: boolean; discountRate: unknown }>(
        `MATCH (u:User {id: $userId})
         OPTIONAL MATCH (u)-[:HAS_SUBSCRIPTION]->(s:Subscription)
           WHERE s.status = 'ACTIVE' AND s.expiresAt > datetime()
         OPTIONAL MATCH (cfg:Config {id: 'platform'})
         RETURN s IS NOT NULL AS isMember,
                coalesce(cfg.memberDiscountRate, $defaultRate) AS discountRate`,
        { userId: session.userId, defaultRate: DEFAULT_MEMBER_DISCOUNT }
      );
      const isMember = memberRows[0]?.isMember === true;
      if (isMember) {
        const discountRate = toNumber(memberRows[0]?.discountRate ?? DEFAULT_MEMBER_DISCOUNT);
        const basePrice = toNumber(result["price"]);
        const discountedPrice = Math.round(basePrice * (1.0 - discountRate) * 100) / 100;
        if (discountedPrice < basePrice) {
          result["originalPrice"] = basePrice;
          result["price"] = discountedPrice;
        }
      }
    }

    return res.json(result);
  } catch (err) {
    logger.error({ err }, "GET /api/drops/:id failed");
    return res.status(500).json({ error: "Failed to fetch drop" });
  }
});

// ── GET /api/drops/:id/photo ─────────────────────────────────────────────────
// Publicly proxies the chef-uploaded food photo so any viewer (including
// unauthenticated customers) can render it without direct storage credentials.

router.get("/:id/photo", async (req, res) => {
  try {
    const rows = await runRead<{ imageUrl: unknown }>(
      `MATCH (d:Drop {id: $id}) RETURN d.imageUrl AS imageUrl`,
      { id: req.params["id"] }
    );

    if (rows.length === 0) return res.status(404).json({ error: "Drop not found" });

    const imageUrl = rows[0]?.imageUrl;
    if (!imageUrl || typeof imageUrl !== "string" || !imageUrl.startsWith("/objects/")) {
      return res.status(404).json({ error: "No uploaded photo for this drop" });
    }

    const objectFile = await objectStorageService.getObjectEntityFile(imageUrl);
    const response   = await objectStorageService.downloadObject(objectFile);

    const SAFE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
    const rawContentType  = response.headers.get("Content-Type") ?? "";
    const safeContentType = SAFE_IMAGE_TYPES.has(rawContentType) ? rawContentType : "image/jpeg";

    res.status(response.status);
    res.setHeader("Content-Type", safeContentType);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const contentLength = response.headers.get("Content-Length");
    if (contentLength) res.setHeader("Content-Length", contentLength);

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
      return;
    }
    res.end();
    return;
  } catch (err) {
    if (err instanceof ObjectNotFoundError) {
      return res.status(404).json({ error: "Photo not found" });
    }
    logger.error({ err }, "GET /api/drops/:id/photo failed");
    return res.status(500).json({ error: "Failed to serve photo" });
  }
});

// ── POST /api/drops ──────────────────────────────────────────────────────────

router.post("/", requireVerifiedChef(), async (req, res) => {
  const parse = CreateDropSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: "Validation failed", issues: parse.error.issues });

  const data = parse.data;
  const session = (req as any).session as SessionUser;

  // Chefs may only post drops as themselves, and only once verified by an
  // admin; admins may post for any chef.
  if (session.role !== "ADMIN") {
    const own = await runRead<{ chefId: string; isVerified: boolean }>(
      "MATCH (u:User {id: $userId})-[:IS_CHEF]->(c:Chef) RETURN c.id AS chefId, c.isVerified AS isVerified",
      { userId: session.userId }
    );
    const ownChefId = own[0]?.chefId;
    if (!ownChefId) return res.status(403).json({ error: "No chef profile linked to this account" });
    if (data.chefId !== ownChefId) {
      return res.status(403).json({ error: "You can only create drops for your own chef profile" });
    }
    if (own[0]?.isVerified !== true) {
      return res.status(403).json({ error: "Your chef profile is pending admin verification — you can create drops once approved" });
    }

    // Wallet freeze check — block drop creation if balance is too negative
    const walletCheck = await runRead<{ balance: unknown; threshold: unknown }>(
      `MATCH (c:Chef {id: $chefId})
       OPTIONAL MATCH (cfg:Config {id: 'platform'})
       RETURN coalesce(c.walletBalance, 0.0) AS balance,
              coalesce(cfg.walletFreezeThreshold, $freezeThreshold) AS threshold`,
      { chefId: data.chefId, freezeThreshold: DEFAULT_WALLET_FREEZE_THRESHOLD }
    );
    const walletBalance = toNumber(walletCheck[0]?.balance ?? 0);
    const freezeThreshold = toNumber(walletCheck[0]?.threshold ?? DEFAULT_WALLET_FREEZE_THRESHOLD);
    if (walletBalance < freezeThreshold) {
      return res.status(403).json({
        error: `Your wallet balance is ${walletBalance.toFixed(2)} TTD — below the platform limit. Settle your cash fees before posting new drops.`,
        code: "WALLET_FROZEN",
        walletBalance,
        freezeThreshold,
      });
    }
  }

  // inventory must be >= minOrders
  if (data.inventory < data.minOrders) {
    return res.status(400).json({ error: "inventory must be ≥ minOrders (can't have hard cap below payout threshold)" });
  }

  // ── imageUrl ownership + content-type validation ───────────────────────────
  // Prevent chefs from referencing another user's private upload (e.g. a food
  // badge or national ID uploaded by someone else) and exposing it publicly via
  // the /drops/:id/photo proxy.  Only uploads the posting chef owns, with an
  // allowed image MIME type, may be stored as a drop photo.
  const ALLOWED_DROP_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

  if (data.imageUrl != null && data.imageUrl !== "") {
    if (!data.imageUrl.startsWith("/objects/")) {
      return res.status(400).json({ error: "imageUrl must be a valid object path" });
    }
    const uploadCheck = await runRead<{ owned: boolean; contentType: unknown }>(
      `MATCH (u:User {id: $userId})-[:OWNS_UPLOAD]->(up:Upload {objectPath: $objectPath})
       RETURN true AS owned, up.contentType AS contentType`,
      { userId: session.userId, objectPath: data.imageUrl }
    );
    if (uploadCheck.length === 0) {
      return res.status(403).json({ error: "You do not own this upload or it does not exist" });
    }
    const contentType = uploadCheck[0]?.contentType as string | undefined;
    if (!contentType || !ALLOWED_DROP_PHOTO_TYPES.has(contentType)) {
      return res.status(400).json({ error: "Upload must be a JPEG, PNG, or WEBP image" });
    }
  }

  try {
    const chefCheck = await runRead("MATCH (c:Chef {id: $chefId}) RETURN true AS ok", { chefId: data.chefId });
    if (chefCheck.length === 0) return res.status(404).json({ error: `Chef ${data.chefId} not found` });

    const dropId = `drop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const records = await runWrite<Record<string, unknown>>(
      `MATCH (c:Chef {id: $chefId})
       CREATE (d:Drop {
         id: $dropId, title: $title, description: $description,
         mealSlot: $mealSlot, price: $price, inventory: $inventory,
         minOrders: $minOrders, currentOrders: 0, status: 'ACTIVE',
         pickupLocation: $pickupLocation, expiresAt: datetime($expiresAt),
         imageIndex: $imageIndex, imageUrl: $imageUrl, tags: $tags,
         isSecret: $isSecret,
         chefEarnings: null, createdAt: datetime()
       })
       CREATE (c)-[:POSTED]->(d)
       CREATE (d)-[:BELONGS_TO]->(c)
       RETURN d.id AS id, d.title AS title, d.mealSlot AS mealSlot,
              d.price AS price, d.inventory AS inventory,
              d.minOrders AS minOrders, d.currentOrders AS currentOrders,
              d.status AS status, d.expiresAt AS expiresAt,
              d.imageUrl AS imageUrl, d.isSecret AS isSecret`,
      {
        chefId: data.chefId, dropId,
        title: data.title, description: data.description,
        mealSlot: data.mealSlot, price: data.price,
        inventory: data.inventory, minOrders: data.minOrders,
        pickupLocation: data.pickupLocation, expiresAt: data.expiresAt,
        imageIndex: data.imageIndex, imageUrl: data.imageUrl ?? null, tags: data.tags,
        isSecret: data.isSecret ?? false,
      }
    );

    logger.info({ dropId, chefId: data.chefId, inventory: data.inventory }, "Drop created");
    return res.status(201).json(normalise(records[0]!));
  } catch (err) {
    logger.error({ err }, "POST /api/drops failed");
    return res.status(500).json({ error: "Failed to create drop" });
  }
});

// ── PATCH /api/drops/:id ──────────────────────────────────────────────────────
// Chefs can update their own live drop details. Inventory may never be lowered
// below already-placed orders, and completed/cancelled drops are immutable.

router.patch("/:id", requireAuth("CHEF", "ADMIN"), async (req, res) => {
  const parse = UpdateDropSchema.safeParse(req.body);
  if (!parse.success || Object.keys(parse.data).length === 0) {
    return res.status(400).json({ error: "Provide at least one valid drop field", issues: parse.success ? undefined : parse.error.issues });
  }

  const session = getSession(req)!;
  try {
    const ownershipQuery = session.role === "ADMIN"
      ? `MATCH (d:Drop {id: $id})
         RETURN d.id AS id, d.status AS status, d.currentOrders AS currentOrders, d.inventory AS inventory`
      : `MATCH (u:User {id: $userId})-[:IS_CHEF]->(c:Chef)-[:POSTED]->(d:Drop {id: $id})
         RETURN d.id AS id, d.status AS status, d.currentOrders AS currentOrders, d.inventory AS inventory`;
    const existing = await runRead<{ id: string; status: string; currentOrders: unknown; inventory: unknown }>(
      ownershipQuery,
      { id: req.params["id"], userId: session.userId },
    );
    if (existing.length === 0) return res.status(404).json({ error: "Drop not found or not owned by you" });
    const current = existing[0]!;
    if (!["ACTIVE", "UNLOCKED"].includes(current.status)) {
      return res.status(409).json({ error: "Only live drops can be edited" });
    }

    const data = parse.data;
    const currentOrders = toNumber(current.currentOrders);
    const inventory = data.inventory ?? toNumber(current.inventory);
    if (inventory < currentOrders) {
      return res.status(400).json({ error: `Plate limit cannot be lower than ${currentOrders} existing orders` });
    }
    if (data.minOrders !== undefined && data.minOrders > inventory) {
      return res.status(400).json({ error: "Minimum orders cannot exceed the plate limit" });
    }
    if (data.expiresAt && new Date(data.expiresAt).getTime() <= Date.now()) {
      return res.status(400).json({ error: "Drop expiry must be in the future" });
    }

    const updates = Object.entries(data)
      .filter(([, value]) => value !== undefined)
      .map(([key]) => `d.${key} = $${key}`)
      .join(", ");
    const rows = await runWrite<Record<string, unknown>>(
      `MATCH (d:Drop {id: $id})
       SET ${updates}, d.updatedAt = datetime()
       RETURN d.id AS id, d.title AS title, d.description AS description,
              d.mealSlot AS mealSlot, d.price AS price, d.inventory AS inventory,
              d.minOrders AS minOrders, d.currentOrders AS currentOrders,
              d.status AS status, d.pickupLocation AS pickupLocation,
              d.expiresAt AS expiresAt, d.imageIndex AS imageIndex,
              d.imageUrl AS imageUrl, d.tags AS tags, d.isSecret AS isSecret`,
      { id: req.params["id"], ...data },
    );
    return res.json(normalise(rows[0]!));
  } catch (err) {
    logger.error({ err, dropId: req.params["id"] }, "PATCH /api/drops/:id failed");
    return res.status(500).json({ error: "Failed to update drop" });
  }
});

// ── PATCH /api/drops/:id/cancel ───────────────────────────────────────────────

router.patch("/:id/cancel", requireAuth("CHEF", "ADMIN"), async (req, res) => {
  const session = getSession(req)!;
  try {
    const ownershipQuery = session.role === "ADMIN"
      ? `MATCH (d:Drop {id: $id}) RETURN d.id AS id, d.status AS status`
      : `MATCH (u:User {id: $userId})-[:IS_CHEF]->(c:Chef)-[:POSTED]->(d:Drop {id: $id})
         RETURN d.id AS id, d.status AS status`;
    const existing = await runRead<{ id: string; status: string }>(
      ownershipQuery,
      { id: req.params["id"], userId: session.userId },
    );
    if (existing.length === 0) return res.status(404).json({ error: "Drop not found or not owned by you" });
    if (!["ACTIVE", "UNLOCKED", "SOLD_OUT"].includes(existing[0]!.status)) {
      return res.status(409).json({ error: "This drop can no longer be cancelled" });
    }

    const rows = await runWrite<{ id: string; status: string }>(
      `MATCH (d:Drop {id: $id})
       SET d.status = 'CANCELLED', d.cancelledAt = datetime(), d.updatedAt = datetime()
       RETURN d.id AS id, d.status AS status`,
      { id: req.params["id"] },
    );
    return res.json(rows[0]);
  } catch (err) {
    logger.error({ err, dropId: req.params["id"] }, "PATCH /api/drops/:id/cancel failed");
    return res.status(500).json({ error: "Failed to cancel drop" });
  }
});

// ── PATCH /api/drops/:id/status (admin override) ────────────────────────────

router.patch("/:id/status", requireAuth("ADMIN"), async (req, res) => {
  const parse = z.object({ status: DropStatus }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: "Invalid status" });

  try {
    const rows = await runWrite<{ id: string; status: string }>(
      `MATCH (d:Drop {id: $id})
       SET d.status = $status, d.adminOverrideAt = datetime()
       RETURN d.id AS id, d.status AS status`,
      { id: req.params["id"], status: parse.data.status }
    );
    if (rows.length === 0) return res.status(404).json({ error: "Drop not found" });
    return res.json(rows[0]);
  } catch (err) {
    logger.error({ err }, "PATCH /api/drops/:id/status failed");
    return res.status(500).json({ error: "Failed to update status" });
  }
});

// ── Normaliser ───────────────────────────────────────────────────────────────

function normalise(r: Record<string, unknown>): Record<string, unknown> {
  const out = { ...r };
  for (const k of ["price", "inventory", "minOrders", "currentOrders", "imageIndex", "points", "rank"]) {
    if (out[k] !== undefined && out[k] !== null) out[k] = toNumber(out[k]);
  }
  if (out["chef"] && typeof out["chef"] === "object") {
    const c = { ...(out["chef"] as Record<string, unknown>) };
    for (const k of ["totalDrops", "successfulDrops", "points", "rank", "rating"]) {
      if (c[k] !== undefined) c[k] = toNumber(c[k]);
    }
    out["chef"] = c;
  }
  for (const k of ["expiresAt", "createdAt", "unlockedAt", "soldOutAt", "adminOverrideAt"]) {
    if (out[k] && typeof (out[k] as any)?.toString === "function") {
      out[k] = (out[k] as any).toString();
    }
  }
  // Computed helpers
  if (out["inventory"] !== undefined && out["currentOrders"] !== undefined) {
    out["remaining"] = Math.max(0, (out["inventory"] as number) - (out["currentOrders"] as number));
    out["soldOut"] = (out["status"] as string) === "SOLD_OUT";
    out["inventoryPct"] = Math.min(1, (out["currentOrders"] as number) / ((out["inventory"] as number) || 1));
  }
  return out;
}

export default router;
