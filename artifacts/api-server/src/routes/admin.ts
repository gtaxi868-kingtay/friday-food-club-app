/**
 * Admin Control Room API
 *
 * GET   /api/admin/stats                   — platform-wide overview
 * GET   /api/admin/drops                   — all drops (all statuses)
 * GET   /api/admin/chefs                   — full chef roster + verification queue
 * PATCH /api/admin/chefs/:id/verify        — verify a chef
 * PATCH /api/admin/chefs/:id/reject        — reject a chef
 * PATCH /api/admin/drops/:id/status        — override drop status
 * GET   /api/admin/config                  — get platform config
 * PATCH /api/admin/config                  — update platform config (fees, markup, discount)
 */
import { Router } from "express";
import { z } from "zod";
import { runRead, runWrite, toNumber } from "../lib/neo4j";
import { requireAuth, hashPassword } from "./auth";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { logger } from "../lib/logger";
import { sendExpoPush, isValidExpoPushToken } from "../lib/push";
import {
  getPlatformConfig,
  clearPlatformConfigCache,
  DEFAULT_PLATFORM_FEE_RATE,
  DEFAULT_MEMBER_DISCOUNT,
  DEFAULT_WALLET_FREEZE_THRESHOLD,
} from "../lib/threshold";

const objectStorageService = new ObjectStorageService();

const router = Router();

// Entire Control Room is admin-only
router.use(requireAuth("ADMIN"));

// ── GET /api/admin/stats ──────────────────────────────────────────────────────

router.get("/stats", async (_req, res) => {
  try {
    const [platformStats, mealSlotBreakdown, topChefs, subStats] = await Promise.all([
      runRead<Record<string, unknown>>(
        `MATCH (d:Drop)
         OPTIONAL MATCH (o:Order)-[:FOR]->(d) WHERE o.status <> 'CANCELLED'
         WITH
           count(DISTINCT d)                                             AS totalDrops,
           count(DISTINCT CASE WHEN d.status = 'ACTIVE'    THEN d END)  AS activeDrops,
           count(DISTINCT CASE WHEN d.status = 'UNLOCKED'  THEN d END)  AS unlockedDrops,
           count(DISTINCT CASE WHEN d.status = 'SOLD_OUT'  THEN d END)  AS soldOutDrops,
           count(DISTINCT CASE WHEN d.status = 'COMPLETED' THEN d END)  AS completedDrops,
           count(DISTINCT o)                                             AS totalOrders,
           sum(CASE WHEN o IS NOT NULL THEN toFloat(o.effectivePrice) ELSE 0.0 END) AS grossRevenue,
           sum(CASE WHEN o IS NOT NULL THEN toFloat(o.platformShare)  ELSE 0.0 END) AS platformRevenue,
           sum(CASE WHEN o IS NOT NULL THEN toFloat(o.chefShare)      ELSE 0.0 END) AS chefPayouts
         MATCH (c:Chef)
         WITH totalDrops, activeDrops, unlockedDrops, soldOutDrops, completedDrops,
              totalOrders, grossRevenue, platformRevenue, chefPayouts,
              count(c)                             AS totalChefs,
              count(CASE WHEN c.isVerified THEN 1 END) AS verifiedChefs,
              count(CASE WHEN NOT c.isVerified THEN 1 END) AS pendingChefs
         OPTIONAL MATCH (u:User)
         RETURN totalDrops, activeDrops, unlockedDrops, soldOutDrops, completedDrops,
                totalOrders, grossRevenue, platformRevenue, chefPayouts,
                totalChefs, verifiedChefs, pendingChefs,
                count(u) AS totalUsers`
      ),
      runRead<{ mealSlot: string; count: unknown; revenue: unknown; soldOut: unknown }>(
        `MATCH (d:Drop)
         OPTIONAL MATCH (o:Order)-[:FOR]->(d) WHERE o.status <> 'CANCELLED'
         RETURN d.mealSlot AS mealSlot,
                count(DISTINCT d) AS count,
                sum(toFloat(o.effectivePrice)) AS revenue,
                count(CASE WHEN d.status = 'SOLD_OUT' THEN 1 END) AS soldOut
         ORDER BY mealSlot`
      ),
      runRead<Record<string, unknown>>(
        `MATCH (c:Chef)-[:POSTED]->(d:Drop)
         WHERE d.status IN ['UNLOCKED', 'SOLD_OUT', 'COMPLETED']
         OPTIONAL MATCH (o:Order)-[:FOR]->(d) WHERE o.status <> 'CANCELLED'
         RETURN c.id AS id, c.name AS name, c.handle AS handle, c.rating AS rating,
                count(DISTINCT d) AS successfulDrops,
                sum(CASE WHEN o IS NOT NULL THEN toFloat(o.chefShare) ELSE 0.0 END) AS totalEarnings
         ORDER BY totalEarnings DESC LIMIT 10`
      ),
      runRead<{ total: unknown; active: unknown; monthlyRevenue: unknown }>(
        `MATCH (s:Subscription)
         RETURN count(s) AS total,
                count(CASE WHEN s.status = 'ACTIVE' AND s.expiresAt > datetime() THEN 1 END) AS active,
                count(CASE WHEN s.status = 'ACTIVE' AND s.expiresAt > datetime() THEN 1 END) * 5.0 AS monthlyRevenue`
      ),
    ]);

    const platform = Object.fromEntries(
      Object.entries(platformStats[0] ?? {}).map(([k, v]) => [k, toNumber(v)])
    );
    const subs = subStats[0] ?? {};

    return res.json({
      platform: {
        ...platform,
        subscriptions: {
          total: toNumber(subs["total"]),
          active: toNumber(subs["active"]),
          monthlyRevenue: toNumber(subs["monthlyRevenue"]),
        },
      },
      byMealSlot: mealSlotBreakdown.map(r => ({
        mealSlot: r.mealSlot,
        count: toNumber(r.count),
        revenue: toNumber(r.revenue),
        soldOut: toNumber(r.soldOut),
      })),
      topChefs: topChefs.map(c => ({
        ...c,
        rating: toNumber(c["rating"]),
        successfulDrops: toNumber(c["successfulDrops"]),
        totalEarnings: toNumber(c["totalEarnings"]),
      })),
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    logger.error({ err }, "GET /api/admin/stats failed");
    return res.status(500).json({ error: "Failed to fetch admin stats" });
  }
});

// ── GET /api/admin/drops ──────────────────────────────────────────────────────

router.get("/drops", async (req, res) => {
  try {
    const status   = req.query["status"]   as string | undefined;
    const mealSlot = req.query["mealSlot"] as string | undefined;
    const chefId   = req.query["chefId"]   as string | undefined;

    const conditions: string[] = [];
    const params: Record<string, unknown> = {};
    if (status)   { conditions.push("d.status = $status");     params["status"]   = status.toUpperCase(); }
    if (mealSlot) { conditions.push("d.mealSlot = $mealSlot"); params["mealSlot"] = mealSlot; }
    if (chefId)   { conditions.push("c.id = $chefId");         params["chefId"]   = chefId; }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = await runRead<Record<string, unknown>>(
      `MATCH (c:Chef)-[:POSTED]->(d:Drop)
       ${where}
       OPTIONAL MATCH (o:Order)-[:FOR]->(d) WHERE o.status <> 'CANCELLED'
       RETURN d.id AS id, d.title AS title, d.mealSlot AS mealSlot,
              d.status AS status, d.price AS price,
              d.inventory AS inventory, d.minOrders AS minOrders,
              d.currentOrders AS currentOrders, d.expiresAt AS expiresAt,
              coalesce(d.isFeatured, false) AS isFeatured,
              c.id AS chefId, c.name AS chefName,
              count(o) AS orderCount,
              sum(toFloat(o.effectivePrice)) AS batchRevenue
       ORDER BY isFeatured DESC, d.expiresAt DESC`,
      params
    );

    const drops = rows.map(r => ({
      ...r,
      price: toNumber(r["price"]),
      inventory: toNumber(r["inventory"]),
      minOrders: toNumber(r["minOrders"]),
      currentOrders: toNumber(r["currentOrders"]),
      remaining: Math.max(0, toNumber(r["inventory"]) - toNumber(r["currentOrders"])),
      orderCount: toNumber(r["orderCount"]),
      batchRevenue: toNumber(r["batchRevenue"]),
      isFeatured: Boolean(r["isFeatured"]),
      expiresAt: (r["expiresAt"] as any)?.toString?.() ?? r["expiresAt"],
    }));

    return res.json({ drops, total: drops.length });
  } catch (err) {
    logger.error({ err }, "GET /api/admin/drops failed");
    return res.status(500).json({ error: "Failed to fetch drops" });
  }
});

// ── GET /api/admin/chefs ──────────────────────────────────────────────────────

router.get("/chefs", async (_req, res) => {
  try {
    const rows = await runRead<Record<string, unknown>>(
      `MATCH (c:Chef)
       OPTIONAL MATCH (c)-[:POSTED]->(d:Drop)
       WITH c,
            count(d) AS totalDrops,
            count(CASE WHEN d.status IN ['UNLOCKED','SOLD_OUT','COMPLETED'] THEN 1 END) AS successfulDrops
       OPTIONAL MATCH (c)-[:HAS_CREDIT]->(cr:AdminCredit)
       WITH c, totalDrops, successfulDrops, cr
       ORDER BY cr.createdAt DESC
       WITH c, totalDrops, successfulDrops,
            collect(CASE WHEN cr IS NOT NULL
                         THEN {amount: cr.amount, note: cr.note, createdAt: toString(cr.createdAt)}
                         END) AS creditHistory
       RETURN c.id AS id, c.name AS name, c.handle AS handle,
              c.cuisine AS cuisine, c.region AS region,
              c.isVerified AS isVerified, c.rating AS rating,
              c.points AS points, c.rank AS rank,
              c.createdAt AS createdAt,
              c.verificationStatus AS verificationStatus,
              c.foodBadgeUrl       AS foodBadgeUrl,
              c.nationalIdUrl      AS nationalIdUrl,
              c.rejectionReason    AS rejectionReason,
              toString(c.submittedAt) AS submittedAt,
              c.walletBalance      AS walletBalance,
              toString(c.lastAdminCredit) AS lastAdminCredit,
              c.lastAdminCreditNote AS lastAdminCreditNote,
              totalDrops, successfulDrops, creditHistory
       ORDER BY
         CASE c.verificationStatus WHEN 'PENDING_REVIEW' THEN 0 ELSE 1 END ASC,
         c.points DESC`
    );

    return res.json({
      chefs: rows.map(c => ({
        ...c,
        rating: toNumber(c["rating"]),
        points: toNumber(c["points"]),
        rank: toNumber(c["rank"]),
        totalDrops: toNumber(c["totalDrops"]),
        successfulDrops: toNumber(c["successfulDrops"]),
        walletBalance: c["walletBalance"] != null ? toNumber(c["walletBalance"]) : null,
        creditHistory: (() => {
          // Build ledger from AdminCredit nodes (newest first)
          const history = Array.isArray(c["creditHistory"])
            ? (c["creditHistory"] as any[]).filter(Boolean).map((cr: any) => ({
                amount: cr.amount != null ? toNumber(cr.amount) : null,
                note: cr.note ?? null,
                createdAt: cr.createdAt ?? null,
              }))
            : [];
          // Backfill legacy credit recorded on the Chef node before AdminCredit nodes
          // were introduced. Amount is unavailable for pre-migration records.
          if (history.length === 0 && c["lastAdminCredit"]) {
            history.push({
              amount: null,
              note: (c["lastAdminCreditNote"] as string | null) ?? null,
              createdAt: c["lastAdminCredit"] as string,
            });
          }
          return history;
        })(),
        verificationStatus: c["verificationStatus"] ?? (c["isVerified"] ? "VERIFIED" : "PENDING_REVIEW"),
      })),
      pendingVerification: rows.filter(c =>
        c["verificationStatus"] === "PENDING_REVIEW" || (!c["verificationStatus"] && !c["isVerified"])
      ).length,
    });
  } catch (err) {
    logger.error({ err }, "GET /api/admin/chefs failed");
    return res.status(500).json({ error: "Failed to fetch chefs" });
  }
});

// ── PATCH /api/admin/chefs/:id/verify ────────────────────────────────────────

router.patch("/chefs/:id/verify", async (req, res) => {
  try {
    // Enforce document invariant: both foodBadgeUrl and nationalIdUrl must be
    // present on the Chef node AND owned by the linked user via OWNS_UPLOAD.
    // This prevents approving chefs who bypassed the document-upload flow.
    const check = await runRead<{
      foodBadge: string | null;
      nationalId: string | null;
      ownedBadge: boolean;
      ownedId: boolean;
    }>(
      `MATCH (c:Chef {id: $id})
       OPTIONAL MATCH (u:User)-[:IS_CHEF]->(c)
       OPTIONAL MATCH (u)-[:OWNS_UPLOAD]->(badge:Upload {objectPath: c.foodBadgeUrl})
       OPTIONAL MATCH (u)-[:OWNS_UPLOAD]->(nid:Upload   {objectPath: c.nationalIdUrl})
       RETURN c.foodBadgeUrl   AS foodBadge,
              c.nationalIdUrl  AS nationalId,
              badge IS NOT NULL AS ownedBadge,
              nid   IS NOT NULL AS ownedId`,
      { id: req.params["id"] }
    );
    const chef = check[0];
    if (!chef) return res.status(404).json({ error: "Chef not found" });
    if (!chef.foodBadge || !chef.nationalId) {
      return res.status(422).json({
        error: "Cannot approve: chef has not submitted required documents (Food Badge and National ID).",
      });
    }
    if (!chef.ownedBadge || !chef.ownedId) {
      return res.status(422).json({
        error: "Cannot approve: submitted documents were not uploaded by the chef's own account.",
      });
    }

    // Verify both objects exist in GCS AND validate stored metadata
    // (MIME type + size) — mirrors the same checks run at apply time.
    // An object could be replaced between apply and approval; we recheck here.
    const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
    const MAX_BYTES = 5 * 1024 * 1024;
    for (const [label, path] of [
      ["Food Badge", chef.foodBadge!],
      ["National ID", chef.nationalId!],
    ] as const) {
      let file;
      try {
        file = await objectStorageService.getObjectEntityFile(path);
      } catch (e) {
        if (e instanceof ObjectNotFoundError) {
          return res.status(422).json({ error: `Cannot approve: ${label} document does not exist in storage.` });
        }
        throw e;
      }
      const [meta] = await file.getMetadata();
      const storedType = String(meta.contentType ?? "");
      const storedSize = Number(meta.size ?? 0);
      if (!ALLOWED_MIME.has(storedType)) {
        return res.status(422).json({ error: `Cannot approve: ${label} has an invalid content type (${storedType || "unknown"}). Must be JPEG, PNG, or WEBP.` });
      }
      if (storedSize > MAX_BYTES) {
        return res.status(422).json({ error: `Cannot approve: ${label} exceeds 5 MB (${(storedSize / 1024 / 1024).toFixed(1)} MB).` });
      }
    }

    // Mark chef verified; also promote the linked User to CHEF role so the
    // next login produces a token with role:'CHEF' for chef-only API access.
    const rows = await runWrite<{ id: string; pushToken: string | null }>(
      `MATCH (c:Chef {id: $id})
       OPTIONAL MATCH (u:User)-[:IS_CHEF]->(c)
       SET c.isVerified = true,
           c.verificationStatus = 'VERIFIED',
           c.rejectionReason = null,
           c.verifiedAt = datetime(),
           u.role = 'CHEF'
       RETURN c.id AS id, u.expoPushToken AS pushToken`,
      { id: req.params["id"] }
    );
    if (rows.length === 0) return res.status(404).json({ error: "Chef not found" });

    const pushToken = rows[0]?.pushToken ?? null;

    // Dispatch push notification fully out of the request path — never await it
    // so a slow or unreachable Expo service cannot stall the admin action.
    // notificationQueued is only true when the token passes format validation;
    // an ineligible/null token is silently skipped and reported as false.
    const notificationQueued = isValidExpoPushToken(pushToken);
    if (notificationQueued) {
      sendExpoPush([{
        to: pushToken!,
        title: "Application Approved 🎉",
        body: "Congratulations! Your chef application has been approved. Sign in to access your chef tools.",
        data: { type: "CHEF_VERIFIED" },
        sound: "default",
      }]).then(ok => {
        logger.info({ chefId: req.params["id"], ok }, "Approval push notification dispatched");
      }).catch(err => {
        logger.warn({ chefId: req.params["id"], err }, "Approval push notification failed");
      });
    }

    logger.info({ chefId: req.params["id"], notificationQueued }, "Chef verified");
    return res.json({ id: req.params["id"], isVerified: true, verificationStatus: "VERIFIED", notificationSent: notificationQueued });
  } catch (err) {
    return res.status(500).json({ error: "Failed to verify chef" });
  }
});

// ── PATCH /api/admin/chefs/:id/reject ────────────────────────────────────────

const RejectSchema = z.object({ reason: z.string().min(1).max(500).optional() });

router.patch("/chefs/:id/reject", async (req, res) => {
  const parse = RejectSchema.safeParse(req.body);
  const reason = parse.success ? (parse.data.reason ?? null) : null;
  try {
    const rows = await runWrite<{ id: string; pushToken: string | null }>(
      `MATCH (c:Chef {id: $id})
       OPTIONAL MATCH (u:User)-[:IS_CHEF]->(c)
       SET c.isVerified = false,
           c.verificationStatus = 'REJECTED',
           c.rejectionReason = $reason,
           c.rejectedAt = datetime(),
           u.role = 'BUYER'
       RETURN c.id AS id, u.expoPushToken AS pushToken`,
      { id: req.params["id"], reason }
    );
    if (rows.length === 0) return res.status(404).json({ error: "Chef not found" });

    const pushToken = rows[0]?.pushToken ?? null;

    // Dispatch push notification fully out of the request path — never await it
    // so a slow or unreachable Expo service cannot stall the admin action.
    // notificationQueued is only true when the token passes format validation;
    // an ineligible/null token is silently skipped and reported as false.
    const notificationQueued = isValidExpoPushToken(pushToken);
    if (notificationQueued) {
      const body = reason
        ? `Your application was not approved: ${reason}`
        : "Your chef application was not approved at this time. You may reapply after addressing the feedback.";
      sendExpoPush([{
        to: pushToken!,
        title: "Application Update",
        body,
        data: { type: "CHEF_REJECTED", reason: reason ?? null },
        sound: "default",
      }]).then(ok => {
        logger.info({ chefId: req.params["id"], ok }, "Rejection push notification dispatched");
      }).catch(err => {
        logger.warn({ chefId: req.params["id"], err }, "Rejection push notification failed");
      });
    }

    logger.info({ chefId: req.params["id"], reason, notificationQueued }, "Chef application rejected");
    return res.json({ id: req.params["id"], isVerified: false, verificationStatus: "REJECTED", reason, notificationSent: notificationQueued });
  } catch (err) {
    return res.status(500).json({ error: "Failed to reject chef" });
  }
});

// ── PATCH /api/admin/drops/:id/status ────────────────────────────────────────

router.patch("/drops/:id/status", async (req, res) => {
  const parse = z.object({
    status: z.enum(["ACTIVE", "UNLOCKED", "SOLD_OUT", "COMPLETED", "CANCELLED"]),
  }).safeParse(req.body);
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
    return res.status(500).json({ error: "Failed to update status" });
  }
});

// ── GET /api/admin/config ─────────────────────────────────────────────────────

router.get("/config", async (_req, res) => {
  try {
    const rows = await runRead<Record<string, unknown>>(
      `MATCH (cfg:Config {id: 'platform'})
       RETURN cfg.platformFeeRate AS platformFeeRate,
              cfg.memberDiscountRate AS memberDiscountRate,
              cfg.markupRate AS markupRate,
              cfg.clubPassPrice AS clubPassPrice,
              cfg.walletFreezeThreshold AS walletFreezeThreshold`
    );
    const cfg = rows[0] ?? {};
    return res.json({
      platformFeeRate:       cfg["platformFeeRate"] !== null && cfg["platformFeeRate"] !== undefined
        ? toNumber(cfg["platformFeeRate"])
        : DEFAULT_PLATFORM_FEE_RATE,
      memberDiscountRate:    cfg["memberDiscountRate"] !== null && cfg["memberDiscountRate"] !== undefined
        ? toNumber(cfg["memberDiscountRate"])
        : DEFAULT_MEMBER_DISCOUNT,
      markupRate:            cfg["markupRate"] !== null && cfg["markupRate"] !== undefined
        ? toNumber(cfg["markupRate"])
        : 0,
      clubPassPrice:         cfg["clubPassPrice"] !== null && cfg["clubPassPrice"] !== undefined
        ? toNumber(cfg["clubPassPrice"])
        : 5.00,
      walletFreezeThreshold: cfg["walletFreezeThreshold"] !== null && cfg["walletFreezeThreshold"] !== undefined
        ? toNumber(cfg["walletFreezeThreshold"])
        : DEFAULT_WALLET_FREEZE_THRESHOLD,
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch config" });
  }
});

// ── PATCH /api/admin/config ───────────────────────────────────────────────────

router.patch("/config", async (req, res) => {
  const parse = z.object({
    platformFeeRate:       z.number().min(0).max(1).optional(),
    memberDiscountRate:    z.number().min(0).max(1).optional(),
    markupRate:            z.number().min(0).max(2).optional(),
    clubPassPrice:         z.number().min(0).optional(),
    walletFreezeThreshold: z.number().max(0).optional(), // must be ≤ 0
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: "Invalid config values", issues: parse.error.issues });

  try {
    const updates = Object.entries(parse.data)
      .filter(([, v]) => v !== undefined)
      .map(([k]) => `cfg.${k} = $${k}`)
      .join(", ");

    if (!updates) return res.status(400).json({ error: "No fields to update" });

    await runWrite(
      `MERGE (cfg:Config {id: 'platform'})
       SET ${updates}, cfg.updatedAt = datetime()`,
      parse.data as Record<string, unknown>
    );
    clearPlatformConfigCache();

    logger.info({ changes: parse.data }, "Platform config updated");
    return res.json({ success: true, updated: parse.data });
  } catch (err) {
    logger.error({ err }, "PATCH /api/admin/config failed");
    return res.status(500).json({ error: "Failed to update config" });
  }
});

// ── PATCH /api/admin/chefs/:id/wallet/credit ──────────────────────────────────
// Manual wallet top-up — used to clear a chef's cash debt.
// Each credit is persisted as an AdminCredit node for a full audit trail.
//
// Idempotency: callers may pass an `idempotencyKey` (UUID) in the request body.
// A second request with the same key within IDEMPOTENCY_TTL_MS returns the
// original response without creating a new AdminCredit node.

const IDEMPOTENCY_TTL_MS = 60_000; // 60 seconds

interface IdempotencyEntry { expiresAt: number; response: Record<string, unknown> }
type CreditResponse = Record<string, unknown>;

// Completed-operation cache: key → { response, expiresAt }
const creditIdempotencyCache = new Map<string, IdempotencyEntry>();

// In-flight operation map: key → Promise of the response.
// Because Node.js is single-threaded, the check-and-set of this map (done
// synchronously before the first await) is atomic — no two requests can race
// past it for the same key.
const creditInFlight = new Map<string, Promise<CreditResponse>>();

// Periodically evict expired completed-operation entries.
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of creditIdempotencyCache) {
    if (entry.expiresAt <= now) creditIdempotencyCache.delete(key);
  }
}, IDEMPOTENCY_TTL_MS);

async function executeCreditWrite(
  chefId: string,
  amount: number,
  note: string,
): Promise<CreditResponse> {
  const rows = await runWrite<{ chefId: string; newBalance: unknown }>(
    `MATCH (c:Chef {id: $chefId})
     CREATE (cr:AdminCredit {
       id: randomUUID(),
       amount: $amount,
       note: $note,
       createdAt: datetime()
     })
     CREATE (c)-[:HAS_CREDIT]->(cr)
     SET c.walletBalance    = coalesce(c.walletBalance, 0.0) + $amount,
         c.lastAdminCredit  = cr.createdAt,
         c.lastAdminCreditNote = $note
     RETURN c.id AS chefId, c.walletBalance AS newBalance`,
    { chefId, amount, note }
  );
  if (rows.length === 0) throw Object.assign(new Error("Chef not found"), { statusCode: 404 });
  return { success: true, chefId: rows[0]!.chefId, newWalletBalance: toNumber(rows[0]!.newBalance) };
}

router.patch("/chefs/:id/wallet/credit", async (req, res) => {
  const parse = z.object({
    amount: z.number().positive(),
    note: z.string().optional(),
    idempotencyKey: z.string().uuid().optional(),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: "amount (positive number) required" });

  const { idempotencyKey } = parse.data;
  const chefId = req.params["id"]!;
  const noteValue = parse.data.note ?? "Admin manual credit";

  if (idempotencyKey) {
    const cacheKey = `${chefId}:${idempotencyKey}`;

    // 1. Already completed within the TTL window → replay the cached response.
    const cached = creditIdempotencyCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      logger.info({ chefId, idempotencyKey }, "Duplicate credit request — returning cached response");
      return res.json(cached.response);
    }

    // 2. Currently in-flight (concurrent duplicate) → wait for the first to finish.
    //    The synchronous check-and-set below is atomic in Node.js's event loop:
    //    no await occurs between the get() and set(), so no second request can
    //    slip through between them.
    const existing = creditInFlight.get(cacheKey);
    if (existing) {
      logger.info({ chefId, idempotencyKey }, "Concurrent duplicate credit request — awaiting in-flight operation");
      try {
        const responseBody = await existing;
        return res.json(responseBody);
      } catch (err: any) {
        return res.status(err?.statusCode ?? 500).json({ error: err?.message ?? "Failed to credit wallet" });
      }
    }

    // 3. First request for this key — start the operation and register it.
    const operation = executeCreditWrite(chefId, parse.data.amount, noteValue)
      .then(responseBody => {
        // Promote to the completed cache; remove from in-flight.
        creditIdempotencyCache.set(cacheKey, { expiresAt: Date.now() + IDEMPOTENCY_TTL_MS, response: responseBody });
        creditInFlight.delete(cacheKey);
        return responseBody;
      })
      .catch(err => {
        // Remove the reservation on failure so a retry can proceed.
        creditInFlight.delete(cacheKey);
        throw err;
      });

    // Register synchronously (before any await) — this is the atomic gate.
    creditInFlight.set(cacheKey, operation);

    try {
      const responseBody = await operation;
      logger.info({ chefId, amount: parse.data.amount }, "Admin wallet credit applied");
      return res.json(responseBody);
    } catch (err: any) {
      logger.error({ err }, "PATCH /api/admin/chefs/:id/wallet/credit failed");
      return res.status(err?.statusCode ?? 500).json({ error: err?.message ?? "Failed to credit wallet" });
    }
  }

  // No idempotency key supplied — execute directly (backward-compatible).
  try {
    const responseBody = await executeCreditWrite(chefId, parse.data.amount, noteValue);
    logger.info({ chefId, amount: parse.data.amount }, "Admin wallet credit applied");
    return res.json(responseBody);
  } catch (err: any) {
    logger.error({ err }, "PATCH /api/admin/chefs/:id/wallet/credit failed");
    return res.status(err?.statusCode ?? 500).json({ error: err?.message ?? "Failed to credit wallet" });
  }
});

// ── POST /api/admin/chefs ─────────────────────────────────────────────────────
// Manually onboard a verified chef, bypassing the mobile application queue.
// Creates a User + Chef node, marks isVerified immediately, and returns temp credentials.

const AddChefSchema = z.object({
  name:        z.string().min(2).max(100),
  kitchenName: z.string().min(2).max(100).optional(),
  area:        z.string().min(2).max(80),
  email:       z.string().email(),
  cuisine:     z.string().min(2).max(60).optional(),
  phone:       z.string().max(30).optional(),
});

router.post("/chefs", async (req, res) => {
  const parse = AddChefSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: "Validation failed", issues: parse.error.issues });
  const { name, kitchenName, area, email, cuisine, phone } = parse.data;

  try {
    const existing = await runRead<{ id: string }>(
      "MATCH (u:User {email: $email}) RETURN u.id AS id",
      { email: email.toLowerCase() }
    );
    if (existing.length > 0) return res.status(409).json({ error: "An account with this email already exists" });

    const ts = Date.now();
    const rnd = Math.random().toString(36).slice(2, 8);
    const userId = `user_${ts}_${rnd}`;
    const chefId = `chef_${ts}_${rnd}`;
    // Generate a memorable temp password: 8 random chars + 4 digits
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    const tempPassword = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("") +
                         String(Math.floor(Math.random() * 9000) + 1000);
    const passwordHash = hashPassword(tempPassword);
    const displayName  = kitchenName ?? name;
    const handle       = `@${displayName.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 24)}`;

    await runWrite(
      `CREATE (u:User {
         id: $userId, name: $name, email: $email, passwordHash: $passwordHash,
         role: 'CHEF', area: $area, walletBalance: 0.0,
         handle: $handle, points: 0, createdAt: datetime(), phone: $phone
       })
       CREATE (c:Chef {
         id: $chefId, name: $displayName, handle: $handle,
         cuisine: $cuisine, region: $area, isVerified: true,
         verificationStatus: 'VERIFIED', verifiedAt: datetime(),
         rating: 0.0, totalDrops: 0, successfulDrops: 0,
         points: 0, rank: 0, walletBalance: 0.0, submittedAt: datetime()
       })
       CREATE (u)-[:IS_CHEF]->(c)`,
      {
        userId, chefId, name, displayName, email: email.toLowerCase(),
        passwordHash, handle, area,
        cuisine: cuisine ?? "Caribbean",
        phone: phone ?? null,
      }
    );

    logger.info({ userId, chefId, email }, "Chef manually onboarded by admin");
    return res.status(201).json({
      success: true,
      userId, chefId,
      email: email.toLowerCase(),
      handle,
      tempPassword,
    });
  } catch (err) {
    logger.error({ err }, "POST /api/admin/chefs failed");
    return res.status(500).json({ error: "Failed to create chef account" });
  }
});

// ── PATCH /api/admin/drops/:id/featured ──────────────────────────────────────
// Toggle the isFeatured flag — featured drops are pinned to the top of the buyer feed
// with a gold "Admin Find" badge.

router.patch("/drops/:id/featured", async (req, res) => {
  try {
    const rows = await runWrite<{ id: string; isFeatured: boolean }>(
      `MATCH (d:Drop {id: $id})
       SET d.isFeatured = NOT coalesce(d.isFeatured, false),
           d.featuredAt = CASE WHEN NOT coalesce(d.isFeatured, false) THEN datetime() ELSE null END
       RETURN d.id AS id, d.isFeatured AS isFeatured`,
      { id: req.params["id"] }
    );
    if (rows.length === 0) return res.status(404).json({ error: "Drop not found" });
    logger.info({ dropId: req.params["id"], isFeatured: rows[0]!.isFeatured }, "Drop featured status toggled");
    return res.json({ id: rows[0]!.id, isFeatured: Boolean(rows[0]!.isFeatured) });
  } catch (err) {
    logger.error({ err }, "PATCH /api/admin/drops/:id/featured failed");
    return res.status(500).json({ error: "Failed to update featured status" });
  }
});

// ── GET /api/admin/coverage ───────────────────────────────────────────────────
// Regional breakdown — active chefs and live drops per area across T&T.

router.get("/coverage", async (_req, res) => {
  try {
    const rows = await runRead<Record<string, unknown>>(
      `MATCH (c:Chef)
       WHERE c.isVerified = true
       WITH coalesce(nullif(trim(c.region), ''), 'Unknown') AS region,
            collect(c.id) AS chefIds, count(c) AS activeChefs
       OPTIONAL MATCH (chef:Chef)-[:POSTED]->(d:Drop)
       WHERE chef.id IN chefIds
         AND d.status IN ['ACTIVE', 'UNLOCKED']
         AND d.expiresAt > datetime()
       RETURN region, activeChefs, count(d) AS liveDrops
       ORDER BY activeChefs DESC, liveDrops DESC`
    );

    return res.json({
      regions: rows.map(r => ({
        region:      r["region"] as string,
        activeChefs: toNumber(r["activeChefs"]),
        liveDrops:   toNumber(r["liveDrops"]),
      })),
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    logger.error({ err }, "GET /api/admin/coverage failed");
    return res.status(500).json({ error: "Failed to fetch coverage data" });
  }
});

// ── Location / Spots CRUD ─────────────────────────────────────────────────────
// Admins manage named pickup spots across T&T.  A chef can be "pinned" at a
// location, meaning they have a permanent presence there (higher-tier sub)
// rather than only appearing when they have a live drop.

router.get("/locations", async (_req, res) => {
  try {
    const rows = await runRead<Record<string, unknown>>(
      `MATCH (l:Location)
       OPTIONAL MATCH (c:Chef)-[:PINNED_AT]->(l)
       WITH l, collect(
         CASE WHEN c IS NOT NULL THEN {id: c.id, name: c.name, handle: c.handle, isVerified: c.isVerified} ELSE null END
       ) AS chefList
       RETURN l {.*} AS loc, [x IN chefList WHERE x IS NOT NULL] AS pinnedChefs
       ORDER BY l.region, l.name`
    );
    return res.json(
      rows.map(r => ({ ...(r["loc"] as object), pinnedChefs: r["pinnedChefs"] as unknown[] }))
    );
  } catch (err) {
    logger.error({ err }, "GET /api/admin/locations failed");
    return res.status(500).json({ error: "Failed to fetch locations" });
  }
});

router.post("/locations", async (req, res) => {
  try {
    const { name, address, region, lat, lng, isPinnable, nfcId } = req.body as Record<string, unknown>;
    if (!name || !address || !region) {
      return res.status(400).json({ error: "name, address, region are required" });
    }
    const id = crypto.randomUUID();
    await runWrite(
      `CREATE (l:Location {
         id: $id, name: $name, address: $address, region: $region,
         lat: $lat, lng: $lng, isPinnable: $isPinnable,
         nfcId: $nfcId, createdAt: datetime()
       })`,
      { id, name, address, region,
        lat: lat ?? null, lng: lng ?? null,
        isPinnable: isPinnable === true,
        nfcId: (typeof nfcId === "string" && nfcId.trim()) ? nfcId.trim() : null }
    );
    return res.status(201).json({ id });
  } catch (err) {
    logger.error({ err }, "POST /api/admin/locations failed");
    return res.status(500).json({ error: "Failed to create location" });
  }
});

router.patch("/locations/:id", async (req, res) => {
  try {
    const { name, address, region, lat, lng, isPinnable, nfcId } = req.body as Record<string, unknown>;
    await runWrite(
      `MATCH (l:Location {id: $id})
       SET l.name = $name, l.address = $address, l.region = $region,
           l.lat = $lat, l.lng = $lng, l.isPinnable = $isPinnable,
           l.nfcId = $nfcId`,
      { id: req.params["id"], name, address, region,
        lat: lat ?? null, lng: lng ?? null,
        isPinnable: isPinnable === true,
        nfcId: (typeof nfcId === "string" && nfcId.trim()) ? nfcId.trim() : null }
    );
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "PATCH /api/admin/locations/:id failed");
    return res.status(500).json({ error: "Failed to update location" });
  }
});

router.delete("/locations/:id", async (req, res) => {
  try {
    await runWrite(
      `MATCH (l:Location {id: $id}) DETACH DELETE l`,
      { id: req.params["id"] }
    );
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "DELETE /api/admin/locations/:id failed");
    return res.status(500).json({ error: "Failed to delete location" });
  }
});

// Pin a chef to a location (permanent subscriber spot)
router.post("/locations/:id/pin-chef", async (req, res) => {
  try {
    const { chefId } = req.body as { chefId?: string };
    if (!chefId) return res.status(400).json({ error: "chefId required" });
    await runWrite(
      `MATCH (c:Chef {id: $chefId}), (l:Location {id: $locationId})
       MERGE (c)-[:PINNED_AT]->(l)
       SET c.isPinned = true`,
      { chefId, locationId: req.params["id"] }
    );
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "POST /api/admin/locations/:id/pin-chef failed");
    return res.status(500).json({ error: "Failed to pin chef" });
  }
});

// Unpin a chef from a location
router.delete("/locations/:locationId/chefs/:chefId", async (req, res) => {
  try {
    await runWrite(
      `MATCH (c:Chef {id: $chefId})-[r:PINNED_AT]->(l:Location {id: $locationId})
       DELETE r
       WITH c
       WHERE NOT (c)-[:PINNED_AT]->()
       SET c.isPinned = false`,
      { chefId: req.params["chefId"], locationId: req.params["locationId"] }
    );
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "DELETE /api/admin/locations/:locationId/chefs/:chefId failed");
    return res.status(500).json({ error: "Failed to unpin chef" });
  }
});

export default router;
