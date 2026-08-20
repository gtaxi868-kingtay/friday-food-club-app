/**
 * Club Pass Subscriptions API
 *
 * GET  /api/subscriptions/:userId          — check if user has an active Club Pass
 * POST /api/subscriptions/:userId          — subscribe ($5/month Club Pass)
 * DELETE /api/subscriptions/:userId        — cancel subscription
 * GET  /api/subscriptions                  — admin: list all subscriptions
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { runRead, runWrite, toNumber } from "../lib/neo4j";
import { getSession, getGuestId, requireAuth } from "./auth";
import { logger } from "../lib/logger";

const router = Router();

/**
 * Ownership guard: authenticated users may only act on their own userId
 * (admins on any). Anonymous callers may only act on `anon_` guest IDs,
 * which are unguessable client-generated identifiers.
 */
function requireOwnUser(req: Request, res: Response, next: NextFunction) {
  const session = getSession(req);
  const userId = String(req.params["userId"] ?? "");
  if (session?.role === "ADMIN") return next();
  if (session) {
    if (session.userId !== userId) return res.status(403).json({ error: "Not authorized for this user" });
    return next();
  }
  // Guests must prove the identity with their signed guest token
  if (getGuestId(req) !== userId) return res.status(401).json({ error: "Not authenticated" });
  return next();
}

const CLUB_PASS_PRICE = 5.00;  // USD/month — matches Config node
const PASS_DURATION_DAYS = 30;

// ── GET /api/subscriptions/:userId ──────────────────────────────────────────

router.get("/:userId", requireOwnUser, async (req, res) => {
  try {
    const { userId } = req.params;
    const rows = await runRead<{
      id: string; tier: string; status: string;
      startedAt: unknown; expiresAt: unknown; price: unknown;
    }>(
      `MATCH (u:User {id: $userId})-[:HAS_SUBSCRIPTION]->(s:Subscription)
       WHERE s.status = 'ACTIVE' AND s.expiresAt > datetime()
       RETURN s.id AS id, s.tier AS tier, s.status AS status,
              s.startedAt AS startedAt, s.expiresAt AS expiresAt,
              s.price AS price
       ORDER BY s.startedAt DESC LIMIT 1`,
      { userId }
    );

    const active = rows[0] ?? null;
    return res.json({
      isActive: active !== null,
      subscription: active
        ? {
            ...active,
            price: toNumber(active.price),
            startedAt: (active.startedAt as any)?.toString?.() ?? active.startedAt,
            expiresAt: (active.expiresAt as any)?.toString?.() ?? active.expiresAt,
          }
        : null,
    });
  } catch (err) {
    logger.error({ err }, "GET /api/subscriptions/:userId failed");
    return res.status(500).json({ error: "Failed to check subscription" });
  }
});

// ── POST /api/subscriptions/:userId ─────────────────────────────────────────

router.post("/:userId", requireOwnUser, async (req, res) => {
  try {
    const { userId } = req.params;

    // Check for existing active subscription
    const existing = await runRead<{ id: string }>(
      `MATCH (u:User {id: $userId})-[:HAS_SUBSCRIPTION]->(s:Subscription)
       WHERE s.status = 'ACTIVE' AND s.expiresAt > datetime()
       RETURN s.id AS id LIMIT 1`,
      { userId }
    );

    if (existing.length > 0) {
      return res.status(409).json({
        error: "User already has an active Club Pass",
        subscriptionId: existing[0]!.id,
      });
    }

    const subId = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + PASS_DURATION_DAYS * 86_400_000).toISOString();

    await runWrite(
      `MERGE (u:User {id: $userId})
       CREATE (s:Subscription {
         id: $subId, userId: $userId, tier: 'CLUB_PASS',
         status: 'ACTIVE', price: $price,
         startedAt: datetime(), expiresAt: datetime($expiresAt)
       })
       MERGE (u)-[:HAS_SUBSCRIPTION]->(s)`,
      { userId, subId, price: CLUB_PASS_PRICE, expiresAt }
    );

    logger.info({ userId, subId }, "Club Pass activated");
    return res.status(201).json({
      subscriptionId: subId,
      userId,
      tier: "CLUB_PASS",
      status: "ACTIVE",
      price: CLUB_PASS_PRICE,
      expiresAt,
      benefits: [
        "10% member discount on all drops",
        "Priority access to limited drops",
        "Exclusive Club Pass badge",
        "Early drop notifications",
      ],
    });
  } catch (err) {
    logger.error({ err }, "POST /api/subscriptions/:userId failed");
    return res.status(500).json({ error: "Failed to activate subscription" });
  }
});

// ── DELETE /api/subscriptions/:userId ───────────────────────────────────────

router.delete("/:userId", requireOwnUser, async (req, res) => {
  try {
    const { userId } = req.params;
    const rows = await runWrite<{ id: string; expiresAt: unknown }>(
      `MATCH (u:User {id: $userId})-[:HAS_SUBSCRIPTION]->(s:Subscription)
       WHERE s.status = 'ACTIVE'
       SET s.status = 'CANCELLED', s.cancelledAt = datetime()
       RETURN s.id AS id, s.expiresAt AS expiresAt`,
      { userId }
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "No active subscription found" });
    }

    const r = rows[0]!;
    logger.info({ userId, subId: r.id }, "Club Pass cancelled");
    return res.json({
      subscriptionId: r.id,
      status: "CANCELLED",
      // Pass stays valid until end of billing period
      validUntil: (r.expiresAt as any)?.toString?.() ?? r.expiresAt,
    });
  } catch (err) {
    logger.error({ err }, "DELETE /api/subscriptions/:userId failed");
    return res.status(500).json({ error: "Failed to cancel subscription" });
  }
});

// ── GET /api/subscriptions (admin: all) ──────────────────────────────────────

router.get("/", requireAuth("ADMIN"), async (req, res) => {
  try {
    const status = req.query["status"] as string | undefined;
    const params: Record<string, unknown> = {};
    let where = "";
    if (status) { where = "WHERE s.status = $status"; params["status"] = status.toUpperCase(); }

    const rows = await runRead<Record<string, unknown>>(
      `MATCH (u:User)-[:HAS_SUBSCRIPTION]->(s:Subscription)
       ${where}
       RETURN s.id AS id, s.userId AS userId, u.name AS userName,
              s.tier AS tier, s.status AS status,
              s.price AS price,
              s.startedAt AS startedAt, s.expiresAt AS expiresAt
       ORDER BY s.startedAt DESC`,
      params
    );

    const subs: Record<string, unknown>[] = rows.map(r => ({
      ...r,
      price: toNumber(r["price"]),
      startedAt: (r["startedAt"] as any)?.toString?.() ?? r["startedAt"],
      expiresAt: (r["expiresAt"] as any)?.toString?.() ?? r["expiresAt"],
    }));

    // Revenue summary
    const revenue = subs
      .filter(s => s["status"] === "ACTIVE" || s["status"] === "active")
      .reduce((acc, s) => acc + toNumber(s["price"]), 0);

    return res.json({ subscriptions: subs, total: subs.length, monthlyRevenue: revenue });
  } catch (err) {
    logger.error({ err }, "GET /api/subscriptions failed");
    return res.status(500).json({ error: "Failed to fetch subscriptions" });
  }
});

export default router;
