/**
 * Chefs API (public-facing + chef self-service)
 *
 * GET  /api/chefs              — all verified chefs, sorted by rank
 * GET  /api/chefs/me/status    — current chef's verification status (auth required)
 * POST /api/chefs/apply        — BUYER applies to become a chef (auth required)
 * GET  /api/chefs/:id          — single chef + their active drops
 * GET  /api/chefs/:id/drops    — drops posted by a specific chef
 */
import { Router } from "express";
import { z } from "zod";
import neo4j from "neo4j-driver";
import { runRead, runWrite, toNumber } from "../lib/neo4j";
import { requireAuth, type SessionUser } from "./auth";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { logger } from "../lib/logger";
import { DEFAULT_WALLET_FREEZE_THRESHOLD } from "../lib/threshold";

const objectStorageService = new ObjectStorageService();

const router = Router();

// ── GET /api/chefs/me/status ─────────────────────────────────────────────────
// Returns the verification state for the currently logged-in chef/buyer.

router.get("/me/status", requireAuth(), async (req, res) => {
  const session = (req as any).session as SessionUser;
  try {
    const rows = await runRead<Record<string, unknown>>(
      `MATCH (u:User {id: $userId})
       OPTIONAL MATCH (u)-[:IS_CHEF]->(c:Chef)
       RETURN u.role AS role,
              c.id                  AS chefId,
              c.name                AS chefName,
              c.verificationStatus  AS verificationStatus,
              c.isVerified          AS isVerified,
              c.rejectionReason     AS rejectionReason,
              c.submittedAt         AS submittedAt`,
      { userId: session.userId }
    );
    if (rows.length === 0) return res.status(404).json({ error: "User not found" });
    const r = rows[0]!;
    return res.json({
      role:               r["role"],
      chefId:             r["chefId"] ?? null,
      chefName:           r["chefName"] ?? null,
      verificationStatus: r["verificationStatus"] ?? null,
      isVerified:         r["isVerified"] ?? false,
      rejectionReason:    r["rejectionReason"] ?? null,
      submittedAt:        r["submittedAt"] ? String(r["submittedAt"]) : null,
    });
  } catch (err) {
    logger.error({ err }, "GET /api/chefs/me/status failed");
    return res.status(500).json({ error: "Failed to fetch verification status" });
  }
});

// ── GET /api/chefs/me/wallet ─────────────────────────────────────────────────
// Returns the authenticated chef's wallet balance, freeze status, cash debt,
// total earnings, and full AdminCredit history.
// Only readable by the chef who owns the profile or an admin.

router.get("/me/wallet", requireAuth("CHEF", "ADMIN"), async (req, res) => {
  const session = (req as any).session as SessionUser;
  try {
    const [walletRows, earningsRows, creditRows] = await Promise.all([
      runRead<{ balance: unknown; threshold: unknown; chefId: unknown }>(
        `MATCH (u:User {id: $userId})-[:IS_CHEF]->(c:Chef)
         OPTIONAL MATCH (cfg:Config {id: 'platform'})
         RETURN coalesce(c.walletBalance, 0.0)          AS balance,
                coalesce(cfg.walletFreezeThreshold, $freezeThreshold) AS threshold,
                c.id                                     AS chefId`,
        { userId: session.userId, freezeThreshold: DEFAULT_WALLET_FREEZE_THRESHOLD }
      ),
      runRead<{ totalEarnings: unknown }>(
        `MATCH (u:User {id: $userId})-[:IS_CHEF]->(c:Chef)-[:POSTED]->(d:Drop)
         WHERE d.status = 'COMPLETED' AND d.chefEarnings IS NOT NULL
         RETURN coalesce(sum(d.chefEarnings), 0.0) AS totalEarnings`,
        { userId: session.userId }
      ),
      runRead<{ id: unknown; amount: unknown; note: unknown; createdAt: unknown }>(
        `MATCH (u:User {id: $userId})-[:IS_CHEF]->(c:Chef)-[:HAS_CREDIT]->(cr:AdminCredit)
         RETURN cr.id AS id, cr.amount AS amount, cr.note AS note, cr.createdAt AS createdAt
         ORDER BY cr.createdAt DESC`,
        { userId: session.userId }
      ),
    ]);

    if (walletRows.length === 0) {
      return res.status(404).json({ error: "No chef profile linked to this account" });
    }
    const balance       = toNumber(walletRows[0]!.balance);
    const threshold     = toNumber(walletRows[0]!.threshold);
    const totalEarnings = toNumber(earningsRows[0]?.totalEarnings ?? 0);
    const cashDebt      = Math.max(0, -balance);

    const creditHistory = creditRows.map(cr => ({
      id:        cr.id,
      amount:    toNumber(cr.amount),
      note:      (cr.note as string | null) ?? null,
      createdAt: (cr.createdAt as any)?.toString?.() ?? cr.createdAt,
    }));

    return res.json({
      chefId:          walletRows[0]!.chefId,
      walletBalance:   balance,
      freezeThreshold: threshold,
      isFrozen:        balance < threshold,
      cashDebt,
      totalEarnings,
      creditHistory,
    });
  } catch (err) {
    logger.error({ err }, "GET /api/chefs/me/wallet failed");
    return res.status(500).json({ error: "Failed to fetch wallet status" });
  }
});

// ── GET /api/chefs/me/earnings ───────────────────────────────────────────────
// Returns the chef's total real earnings — summed from fulfilled orders
// (escrowStatus IN ['RELEASED', 'CASH_RECONCILED']) — plus current wallet
// balance and a per-drop breakdown ordered most-recent-fulfillment first.

router.get("/me/earnings", requireAuth("CHEF", "ADMIN"), async (req, res) => {
  const session = (req as any).session as SessionUser;
  try {
    // Resolve the chef's own chefId from the session.
    const chefRows = await runRead<{ chefId: string; balance: unknown; threshold: unknown }>(
      `MATCH (u:User {id: $userId})-[:IS_CHEF]->(c:Chef)
       OPTIONAL MATCH (cfg:Config {id: 'platform'})
       RETURN c.id                                      AS chefId,
              coalesce(c.walletBalance, 0.0)            AS balance,
              coalesce(cfg.walletFreezeThreshold, $freezeThreshold) AS threshold`,
      { userId: session.userId, freezeThreshold: DEFAULT_WALLET_FREEZE_THRESHOLD }
    );

    if (chefRows.length === 0) {
      return res.status(404).json({ error: "No chef profile linked to this account" });
    }

    const chefId          = chefRows[0]!.chefId as string;
    const walletBalance   = toNumber(chefRows[0]!.balance);
    const freezeThreshold = toNumber(chefRows[0]!.threshold);

    // Aggregate fulfilled order payouts grouped by drop, ordered by most-recent
    // fulfillment. Only orders that have been released (digital) or
    // cash-reconciled count as real earnings.
    const dropRows = await runRead<{
      dropId: unknown; dropTitle: unknown;
      dropEarnings: unknown; orderCount: unknown; lastFulfilledAt: unknown;
    }>(
      `MATCH (o:Order)-[:FOR]->(d:Drop)<-[:POSTED]-(c:Chef {id: $chefId})
       WHERE o.escrowStatus IN ['RELEASED', 'CASH_RECONCILED']
       RETURN d.id                                      AS dropId,
              d.title                                   AS dropTitle,
              sum(toFloat(coalesce(o.chefShare, 0)))    AS dropEarnings,
              count(o)                                  AS orderCount,
              toString(max(o.fulfilledAt))              AS lastFulfilledAt
       ORDER BY max(o.fulfilledAt) DESC`,
      { chefId }
    );

    const drops = dropRows.map(r => ({
      id:           r.dropId,
      title:        r.dropTitle,
      chefEarnings: toNumber(r.dropEarnings),
      orders:       toNumber(r.orderCount),
      lastFulfilledAt: r.lastFulfilledAt ?? null,
    }));

    const totalEarnings = drops.reduce((sum, d) => sum + d.chefEarnings, 0);

    return res.json({ walletBalance, freezeThreshold, totalEarnings, drops });
  } catch (err) {
    logger.error({ err }, "GET /api/chefs/me/earnings failed");
    return res.status(500).json({ error: "Failed to fetch earnings" });
  }
});

// ── POST /api/chefs/apply ────────────────────────────────────────────────────
// A BUYER (or re-applying REJECTED chef) submits a chef application.
// Creates a Chef node with isVerified: false, verificationStatus: PENDING_REVIEW.

const ApplySchema = z.object({
  kitchenName:    z.string().min(2).max(100),
  area:           z.string().min(2).max(80),
  cuisine:        z.string().min(2).max(80).default("Home Cooking"),
  foodBadgeUrl:   z.string().min(1),
  nationalIdUrl:  z.string().min(1),
  lat:            z.number().min(-90).max(90).optional(),   // GPS latitude for proximity feed
  lon:            z.number().min(-180).max(180).optional(), // GPS longitude for proximity feed
});

router.post("/apply", requireAuth("BUYER", "CHEF"), async (req, res) => {
  const parse = ApplySchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: "Validation failed", issues: parse.error.issues });
  }
  const session = (req as any).session as SessionUser;
  const { kitchenName, area, cuisine, foodBadgeUrl, nationalIdUrl, lat, lon } = parse.data;

  try {
    // Check if chef node already exists and validate doc paths belong to this user
    const existing = await runRead<{ chefId: string; status: unknown }>(
      `MATCH (u:User {id: $userId})
       OPTIONAL MATCH (u)-[:IS_CHEF]->(c:Chef)
       RETURN c.id AS chefId, c.verificationStatus AS status`,
      { userId: session.userId }
    );
    const existingChef = existing[0];
    if (existingChef?.chefId && existingChef.status === "PENDING_REVIEW") {
      return res.status(409).json({ error: "Your application is already under review." });
    }
    if (existingChef?.chefId && existingChef.status === "VERIFIED") {
      return res.status(409).json({ error: "Your chef profile is already verified." });
    }

    // Validate that both doc paths were uploaded by this user (prevents path injection)
    const ownershipCheck = await runRead<{ ownedCount: number }>(
      `MATCH (u:User {id: $userId})-[:OWNS_UPLOAD]->(up:Upload)
       WHERE up.objectPath IN $paths
       RETURN count(up) AS ownedCount`,
      { userId: session.userId, paths: [foodBadgeUrl, nationalIdUrl] }
    );
    const ownedCount = ownershipCheck[0]?.ownedCount ?? 0;
    if (Number(ownedCount) < 2) {
      return res.status(403).json({ error: "Document paths must be uploaded by the authenticated user." });
    }

    // Verify both objects exist in GCS AND validate their stored metadata
    // (content type must be an image, size must be ≤ 5 MB).
    // This guards against: (a) presigned URLs that were never PUT, and
    // (b) uploads that bypassed the client-side MIME/size check.
    const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
    const MAX_BYTES = 5 * 1024 * 1024;
    for (const [label, path] of [["Food Badge", foodBadgeUrl], ["National ID", nationalIdUrl]] as const) {
      let file;
      try {
        file = await objectStorageService.getObjectEntityFile(path);
      } catch (e) {
        if (e instanceof ObjectNotFoundError) {
          return res.status(422).json({ error: `${label} document was not successfully uploaded. Please re-upload and try again.` });
        }
        throw e;
      }
      const [meta] = await file.getMetadata();
      const storedType = String(meta.contentType ?? "");
      const storedSize = Number(meta.size ?? 0);
      if (!ALLOWED_MIME.has(storedType)) {
        return res.status(422).json({ error: `${label} must be a JPEG, PNG, or WEBP image. Found: ${storedType || "unknown"}` });
      }
      if (storedSize > MAX_BYTES) {
        return res.status(422).json({ error: `${label} must be under 5 MB. Stored size: ${(storedSize / 1024 / 1024).toFixed(1)} MB` });
      }
    }

    const chefId = existingChef?.chefId ?? `chef_${session.userId.slice(5)}`;

    // MERGE so a rejected chef can reapply — reset to PENDING_REVIEW
    await runWrite(
      `MATCH (u:User {id: $userId})
       MERGE (c:Chef {id: $chefId})
       ON CREATE SET
         c.name               = $name,
         c.handle             = '@' + toLower(replace($name, ' ', '')),
         c.cuisine            = $cuisine,
         c.region             = $area,
         c.lat                = $lat,
         c.lon                = $lon,
         c.isVerified         = false,
         c.verificationStatus = 'PENDING_REVIEW',
         c.foodBadgeUrl       = $foodBadgeUrl,
         c.nationalIdUrl      = $nationalIdUrl,
         c.submittedAt        = datetime(),
         c.rating             = 0,
         c.totalDrops         = 0,
         c.successfulDrops    = 0,
         c.points             = 0,
         c.rank               = 999,
         c.walletBalance      = 0.0,
         c.createdAt          = datetime()
       ON MATCH SET
         c.verificationStatus = 'PENDING_REVIEW',
         c.isVerified         = false,
         c.name               = $name,
         c.cuisine            = $cuisine,
         c.region             = $area,
         c.lat                = $lat,
         c.lon                = $lon,
         c.foodBadgeUrl       = $foodBadgeUrl,
         c.nationalIdUrl      = $nationalIdUrl,
         c.submittedAt        = datetime(),
         c.rejectionReason    = null
       SET u.area = $area
       MERGE (u)-[:IS_CHEF]->(c)`,
      { userId: session.userId, chefId, name: kitchenName, cuisine, area,
        lat: lat ?? null, lon: lon ?? null, foodBadgeUrl, nationalIdUrl }
    );

    logger.info({ userId: session.userId, chefId }, "Chef application submitted");
    return res.status(201).json({
      chefId,
      verificationStatus: "PENDING_REVIEW",
      message: "Application submitted. An admin will review your documents shortly.",
    });
  } catch (err) {
    logger.error({ err }, "POST /api/chefs/apply failed");
    return res.status(500).json({ error: "Failed to submit application" });
  }
});

// ── GET /api/chefs ───────────────────────────────────────────────────────────

router.get("/", async (_req, res) => {
  try {
    const records = await runRead<Record<string, unknown>>(
      `MATCH (c:Chef)
       WHERE c.isVerified = true
       OPTIONAL MATCH (c)-[:POSTED]->(d:Drop)
       RETURN
         c.id              AS id,
         c.name            AS name,
         c.handle          AS handle,
         c.cuisine         AS cuisine,
         c.region          AS region,
         c.isVerified      AS isVerified,
         c.rating          AS rating,
         c.totalDrops      AS totalDrops,
         c.successfulDrops AS successfulDrops,
         c.points          AS points,
         c.rank            AS rank,
         count(CASE WHEN d.status IN ['PENDING','UNLOCKED'] THEN 1 END) AS activeDrops
       ORDER BY c.rank ASC`
    );

    const chefs = records.map((c) => ({
      ...c,
      rating: toNumber(c["rating"]),
      totalDrops: toNumber(c["totalDrops"]),
      successfulDrops: toNumber(c["successfulDrops"]),
      points: toNumber(c["points"]),
      rank: toNumber(c["rank"]),
      activeDrops: toNumber(c["activeDrops"]),
    }));

    return res.json({ chefs, total: chefs.length });
  } catch (err) {
    logger.error({ err }, "GET /api/chefs failed");
    return res.status(500).json({ error: "Failed to fetch chefs" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const [chefRecords, dropRecords] = await Promise.all([
      runRead<Record<string, unknown>>(
        `MATCH (c:Chef {id: $id})
         RETURN
           c.id              AS id,
           c.name            AS name,
           c.handle          AS handle,
           c.cuisine         AS cuisine,
           c.region          AS region,
           c.isVerified      AS isVerified,
           c.rating          AS rating,
           c.totalDrops      AS totalDrops,
           c.successfulDrops AS successfulDrops,
           c.points          AS points,
           c.rank            AS rank`,
        { id }
      ),
      runRead<Record<string, unknown>>(
        `MATCH (c:Chef {id: $id})-[:POSTED]->(d:Drop)
         WHERE d.status IN ['PENDING','UNLOCKED']
           AND d.expiresAt > datetime()
         RETURN
           d.id            AS id,
           d.title         AS title,
           d.mealSlot      AS mealSlot,
           d.price         AS price,
           d.minOrders     AS minOrders,
           d.currentOrders AS currentOrders,
           d.status        AS status,
           d.expiresAt     AS expiresAt
         ORDER BY d.expiresAt ASC`,
        { id }
      ),
    ]);

    if (chefRecords.length === 0) {
      return res.status(404).json({ error: "Chef not found" });
    }

    const c = chefRecords[0]!;
    return res.json({
      ...c,
      rating: toNumber(c["rating"]),
      totalDrops: toNumber(c["totalDrops"]),
      successfulDrops: toNumber(c["successfulDrops"]),
      points: toNumber(c["points"]),
      rank: toNumber(c["rank"]),
      activeDrops: dropRecords.map((d) => ({
        ...d,
        price: toNumber(d["price"]),
        minOrders: toNumber(d["minOrders"]),
        currentOrders: toNumber(d["currentOrders"]),
        expiresAt: (d["expiresAt"] as any)?.toString?.() ?? d["expiresAt"],
      })),
    });
  } catch (err) {
    logger.error({ err }, "GET /api/chefs/:id failed");
    return res.status(500).json({ error: "Failed to fetch chef" });
  }
});

// ── GET /api/chefs/:id/drops ─────────────────────────────────────────────────
// Returns a chef's full drop history (all statuses), newest first.
// Public — no auth required; used by the mobile chef-profile screen.

router.get("/:id/drops", async (req, res) => {
  const { id } = req.params;
  const limitRaw = Math.min(Math.trunc(parseInt((req.query["limit"] as string) ?? "30", 10)), 50);
  const limit = neo4j.int(isNaN(limitRaw) ? 30 : limitRaw); // Neo4j requires an integer type for LIMIT
  try {
    const rows = await runRead<Record<string, unknown>>(
      `MATCH (c:Chef {id: $id})-[:POSTED]->(d:Drop)
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
         d.imageIndex     AS imageIndex,
         d.tags           AS tags,
         d.pickupLocation AS pickupLocation,
         d.expiresAt      AS expiresAt,
         d.createdAt      AS createdAt
       ORDER BY d.createdAt DESC
       LIMIT $limit`,
      { id, limit }
    );

    if (rows.length === 0) {
      // Check the chef exists at all
      const exists = await runRead<{ n: unknown }>(
        "MATCH (c:Chef {id: $id}) RETURN c.id AS n", { id }
      );
      if (exists.length === 0) return res.status(404).json({ error: "Chef not found" });
    }

    const drops = rows.map(d => ({
      id:             d["id"],
      title:          d["title"],
      description:    d["description"],
      mealSlot:       d["mealSlot"],
      price:          toNumber(d["price"]),
      inventory:      toNumber(d["inventory"]),
      minOrders:      toNumber(d["minOrders"]),
      currentOrders:  toNumber(d["currentOrders"]),
      status:         d["status"],
      imageIndex:     toNumber(d["imageIndex"]) || 1,
      tags:           (d["tags"] as string[]) ?? [],
      pickupLocation: d["pickupLocation"],
      expiresAt:      (d["expiresAt"] as any)?.toString?.() ?? d["expiresAt"],
      createdAt:      (d["createdAt"] as any)?.toString?.() ?? d["createdAt"],
    }));

    return res.json({ drops, total: drops.length });
  } catch (err) {
    logger.error({ err }, "GET /api/chefs/:id/drops failed");
    return res.status(500).json({ error: "Failed to fetch chef drops" });
  }
});

export default router;
