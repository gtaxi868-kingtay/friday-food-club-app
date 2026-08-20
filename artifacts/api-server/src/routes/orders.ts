/**
 * Orders API
 *
 * POST   /api/orders               — place a pre-order (inventory engine)
 * GET    /api/orders               — list orders (filter: userId, dropId)
 * GET    /api/orders/:id           — single order
 * PATCH  /api/orders/:id/cancel    — cancel a pending order
 */
import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { runRead, runWrite, toNumber } from "../lib/neo4j";
import { getPlatformConfig } from "../lib/threshold";
import {
  getSession, getGuestId, createGuestToken, setGuestCookie, type SessionUser,
} from "./auth";
import { logger } from "../lib/logger";

const router = Router();

const PlaceOrderSchema = z.object({
  dropId: z.string().min(1),
  paymentMethod: z.enum(["DIGITAL", "CASH"]).default("DIGITAL"),
  // legacy field — ignored; identity always comes from credentials
  userId: z.string().optional(),
});

// ── POST /api/orders ─────────────────────────────────────────────────────────
// Identity: authenticated sessions use the session user. Anonymous (mobile
// guest) callers get a SERVER-issued guest ID bound to a signed cookie /
// returned guest token — caller-supplied IDs are never trusted.

router.post("/", async (req, res) => {
  const parse = PlaceOrderSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: "Validation failed", issues: parse.error.issues });

  const session = getSession(req);
  const { dropId } = parse.data;

  let userId: string;
  let issuedGuestToken: string | null = null;
  if (session) {
    userId = session.userId;
  } else {
    const existingGuest = getGuestId(req);
    if (existingGuest) {
      userId = existingGuest;
    } else {
      userId = `anon_${crypto.randomBytes(12).toString("hex")}`;
      issuedGuestToken = createGuestToken(userId);
      setGuestCookie(res, issuedGuestToken);
    }
  }

  try {
    // Friendly pre-checks (final authority is the atomic write below)
    const dropCheck = await runRead<{ status: string; inventory: unknown; currentOrders: unknown; isSecret: unknown }>(
      "MATCH (d:Drop {id: $dropId}) RETURN d.status AS status, d.inventory AS inventory, d.currentOrders AS currentOrders, coalesce(d.isSecret, false) AS isSecret",
      { dropId }
    );
    if (dropCheck.length === 0) return res.status(404).json({ error: "Drop not found" });
    const drop = dropCheck[0]!;
    if (drop.status === "SOLD_OUT")  return res.status(409).json({ error: "This drop is SOLD OUT — no plates remaining" });
    if (drop.status === "COMPLETED") return res.status(409).json({ error: "This drop has been completed" });
    if (drop.status === "CANCELLED") return res.status(409).json({ error: "This drop has been cancelled" });

    // Secret drops are only orderable on Fridays (Trinidad & Tobago time, UTC-4)
    if (drop.isSecret === true) {
      const dayInTrinidad = new Date().toLocaleDateString("en-US", {
        timeZone: "America/Port_of_Spain",
        weekday: "long",
      });
      if (dayInTrinidad !== "Friday") {
        return res.status(403).json({
          error: "Secret drops are only available on Fridays. Come back then — this one will be waiting for you.",
          code: "NOT_FRIDAY",
        });
      }
    }

    // Member status (registered users only)
    const memberCheck = await runRead<{ isActive: boolean }>(
      `OPTIONAL MATCH (u:User {id: $userId})-[:HAS_SUBSCRIPTION]->(s:Subscription)
       WHERE s.status = 'ACTIVE' AND s.expiresAt > datetime()
       RETURN count(s) > 0 AS isActive`,
      { userId }
    );
    const isMember = memberCheck[0]?.isActive === true;
    const cfg = await getPlatformConfig();
    const discountRate = isMember ? cfg.memberDiscountRate : 0;

    const orderId = `order_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
    const pickupToken = `FFC-${crypto.randomBytes(5).toString("hex").toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

    const { paymentMethod = "DIGITAL" } = parse.data;

    // Single atomic transaction: duplicate check + capacity check + inventory
    // increment + status transition + Order creation + graph links.
    const rows = await runWrite<Record<string, unknown>>(
      `MATCH (d:Drop {id: $dropId})
       WHERE d.status IN ['ACTIVE', 'UNLOCKED'] AND d.currentOrders < d.inventory
       OPTIONAL MATCH (u0:User {id: $userId})-[:PLACED]->(dup:Order)-[:FOR]->(d)
       WHERE dup.status <> 'CANCELLED'
       WITH d, count(dup) AS dupCount, d.status = 'ACTIVE' AS wasActive
       WHERE dupCount = 0
       SET d.currentOrders = d.currentOrders + 1
       WITH d, wasActive,
            d.currentOrders >= d.minOrders  AS shouldUnlock,
            d.currentOrders >= d.inventory  AS shouldSoldOut
       SET d.status = CASE
             WHEN shouldSoldOut THEN 'SOLD_OUT'
             WHEN shouldUnlock  THEN 'UNLOCKED'
             ELSE d.status
           END,
           d.unlockedAt = CASE WHEN shouldUnlock AND wasActive AND NOT shouldSoldOut THEN datetime() ELSE d.unlockedAt END,
           d.soldOutAt  = CASE WHEN shouldSoldOut THEN datetime() ELSE d.soldOutAt END,
           d.chefEarnings = CASE
             WHEN shouldUnlock AND d.chefEarnings IS NULL
             THEN (d.currentOrders * toFloat(d.price)) * (1.0 - $feeRate)
             ELSE d.chefEarnings
           END
       WITH d, wasActive, shouldUnlock, shouldSoldOut,
            toFloat(d.price) AS basePrice,
            round(toFloat(d.price) * (1.0 - $discountRate) * 100) / 100 AS effectivePrice
       MERGE (u:User {id: $userId})
       CREATE (o:Order {
         id: $orderId, price: basePrice, effectivePrice: effectivePrice,
         isMemberOrder: $isMember, status: 'PENDING', orderedAt: datetime(),
         pickupToken: $pickupToken,
         paymentMethod: $paymentMethod,
         escrowStatus: CASE WHEN $paymentMethod = 'CASH' THEN 'CASH' ELSE 'HELD' END
       })
       CREATE (u)-[:PLACED]->(o)
       CREATE (o)-[:FOR]->(d)
       RETURN basePrice, effectivePrice,
              d.currentOrders AS newCount, d.inventory AS inventory,
              d.status AS status, d.chefEarnings AS chefEarnings,
              (shouldUnlock AND wasActive) AS justUnlocked,
              shouldSoldOut AS justSoldOut`,
      { dropId, userId, orderId, pickupToken, isMember, feeRate: cfg.platformFeeRate, discountRate, paymentMethod }
    );

    if (rows.length === 0) {
      // The atomic write rejected: either a duplicate order or the drop filled.
      const dupe = await runRead<{ id: string }>(
        `MATCH (u:User {id: $userId})-[:PLACED]->(o:Order)-[:FOR]->(d:Drop {id: $dropId})
         WHERE o.status <> 'CANCELLED' RETURN o.id AS id`,
        { userId, dropId }
      );
      if (dupe.length > 0) {
        return res.status(409).json({ error: "You already have an order for this drop", orderId: dupe[0]!.id });
      }
      return res.status(409).json({ error: "This drop is SOLD OUT — no plates remaining" });
    }

    const r = rows[0]!;
    const basePrice = toNumber(r["basePrice"]);
    const effectivePrice = toNumber(r["effectivePrice"]);
    const newCount = toNumber(r["newCount"]);
    const inventory = toNumber(r["inventory"]);
    const justSoldOut = r["justSoldOut"] === true;
    const justUnlocked = r["justUnlocked"] === true;

    if (justSoldOut)  logger.info({ dropId }, "Drop SOLD_OUT");
    if (justUnlocked) logger.info({ dropId }, "Drop UNLOCKED");
    logger.info({ orderId, dropId, userId, isMember, justSoldOut }, "Order placed");

    return res.status(201).json({
      order: {
        id: orderId, dropId, userId,
        price: basePrice, effectivePrice,
        isMemberOrder: isMember, status: "PENDING",
        paymentMethod,
        pickupToken,
        escrowStatus: paymentMethod === "CASH" ? "CASH" : "HELD",
        orderedAt: new Date().toISOString(),
        memberDiscount: isMember ? effectivePrice - basePrice : 0,
      },
      // Guest credential (also set as HttpOnly cookie) — mobile clients store
      // this and send it back as X-Guest-Token.
      ...(issuedGuestToken ? { guestToken: issuedGuestToken } : {}),
      drop: {
        id: dropId,
        currentOrders: newCount,
        inventory,
        remaining: Math.max(0, inventory - newCount),
        status: r["status"],
        justUnlocked,
        justSoldOut,
        chefEarnings: r["chefEarnings"] !== null ? toNumber(r["chefEarnings"]) : null,
      },
    });
  } catch (err: any) {
    logger.error({ err }, "POST /api/orders failed");
    return res.status(500).json({ error: "Failed to place order" });
  }
});

// ── GET /api/orders ───────────────────────────────────────────────────────────

router.get("/", async (req, res) => {
  try {
    const session = getSession(req);
    let userId = req.query["userId"] as string | undefined;
    const dropId = req.query["dropId"] as string | undefined;

    // Access control: admins see everything; authenticated users see their own
    // orders; guests see only the identity proven by their signed guest token.
    if (session?.role !== "ADMIN") {
      if (session) {
        userId = session.userId; // force own scope
      } else {
        const guestId = getGuestId(req);
        if (!guestId) return res.status(401).json({ error: "Not authorized to list orders" });
        userId = guestId;
      }
      if (dropId && !userId) return res.status(403).json({ error: "Not authorized" });
    }

    const conditions: string[] = [];
    const params: Record<string, unknown> = {};
    if (userId) { conditions.push("u.id = $userId"); params["userId"] = userId; }
    if (dropId) { conditions.push("d.id = $dropId"); params["dropId"] = dropId; }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = await runRead<Record<string, unknown>>(
      `MATCH (u:User)-[:PLACED]->(o:Order)-[:FOR]->(d:Drop)
       OPTIONAL MATCH (c:Chef)-[:POSTED]->(d)
       ${where}
       RETURN o.id AS id, o.price AS price, o.effectivePrice AS effectivePrice,
              o.isMemberOrder AS isMemberOrder, o.status AS status, o.orderedAt AS orderedAt,
              o.pickupToken AS pickupToken, o.escrowStatus AS escrowStatus,
              coalesce(o.paymentMethod, 'DIGITAL') AS paymentMethod,
              d.id AS dropId, d.title AS dropTitle, d.mealSlot AS mealSlot,
              d.expiresAt AS expiresAt, d.inventory AS inventory,
              d.currentOrders AS currentOrders, d.status AS dropStatus,
              d.pickupLocation AS pickupLocation,
              c.name AS chefName, u.id AS userId
       ORDER BY o.orderedAt DESC`,
      params
    );

    const orders = rows.map(r => ({
      ...r,
      price: toNumber(r["price"]),
      effectivePrice: toNumber(r["effectivePrice"]),
      inventory: toNumber(r["inventory"]),
      currentOrders: toNumber(r["currentOrders"]),
      orderedAt: (r["orderedAt"] as any)?.toString?.() ?? r["orderedAt"],
      expiresAt: (r["expiresAt"] as any)?.toString?.() ?? r["expiresAt"],
    }));

    return res.json({ orders, total: orders.length });
  } catch (err) {
    logger.error({ err }, "GET /api/orders failed");
    return res.status(500).json({ error: "Failed to fetch orders" });
  }
});

// ── GET /api/orders/:id ───────────────────────────────────────────────────────

router.get("/:id", async (req, res) => {
  try {
    const session = getSession(req);
    const rows = await runRead<Record<string, unknown>>(
      `MATCH (u:User)-[:PLACED]->(o:Order {id: $id})-[:FOR]->(d:Drop)
       OPTIONAL MATCH (c:Chef)-[:POSTED]->(d)
       RETURN o.id AS id, o.price AS price, o.effectivePrice AS effectivePrice,
              o.isMemberOrder AS isMemberOrder, o.status AS status, o.orderedAt AS orderedAt,
              o.pickupToken AS pickupToken, o.escrowStatus AS escrowStatus,
              coalesce(o.paymentMethod, 'DIGITAL') AS paymentMethod,
              d.id AS dropId, d.title AS dropTitle, d.mealSlot AS mealSlot,
              d.expiresAt AS expiresAt, d.inventory AS inventory,
              d.currentOrders AS currentOrders, d.status AS dropStatus,
              d.pickupLocation AS pickupLocation,
              c.name AS chefName, u.id AS userId`,
      { id: req.params["id"] }
    );

    if (rows.length === 0) return res.status(404).json({ error: "Order not found" });
    const r = rows[0]!;
    const ownerId = String(r["userId"] ?? "");
    const isOwner = session?.userId === ownerId || (!session && getGuestId(req) === ownerId);
    if (!isOwner && session?.role !== "ADMIN") {
      return res.status(403).json({ error: "Not authorized to view this order" });
    }
    return res.json({
      ...r,
      price: toNumber(r["price"]),
      effectivePrice: toNumber(r["effectivePrice"]),
      inventory: toNumber(r["inventory"]),
      currentOrders: toNumber(r["currentOrders"]),
      orderedAt: (r["orderedAt"] as any)?.toString?.() ?? r["orderedAt"],
      expiresAt: (r["expiresAt"] as any)?.toString?.() ?? r["expiresAt"],
    });
  } catch (err) {
    logger.error({ err }, "GET /api/orders/:id failed");
    return res.status(500).json({ error: "Failed to fetch order" });
  }
});

// ── PATCH /api/orders/:id/cancel ─────────────────────────────────────────────

router.patch("/:id/cancel", async (req, res) => {
  try {
    const session = getSession(req);
    // Ownership check before mutation
    const owner = await runRead<{ ownerId: string }>(
      `MATCH (u:User)-[:PLACED]->(o:Order {id: $id}) RETURN u.id AS ownerId`,
      { id: req.params["id"] }
    );
    const ownerId = owner[0]?.ownerId ?? "";
    const isOwner = session?.userId === ownerId || (!session && getGuestId(req) === ownerId);
    if (owner.length > 0 && !isOwner && session?.role !== "ADMIN") {
      return res.status(403).json({ error: "Not authorized to cancel this order" });
    }

    const rows = await runWrite<{ status: string; dropId: string }>(
      `MATCH (o:Order {id: $id})-[:FOR]->(d:Drop)
       WHERE o.status = 'PENDING'
       SET o.status      = 'CANCELLED',
           o.cancelledAt = datetime(),
           // Mark escrow as cancelled so it is excluded from all financial ledger totals
           o.escrowStatus = CASE
             WHEN o.escrowStatus IN ['HELD', 'CASH'] THEN 'CANCELLED'
             ELSE o.escrowStatus
           END,
           d.currentOrders = CASE WHEN d.currentOrders > 0 THEN d.currentOrders - 1 ELSE 0 END,
           // Re-open if was SOLD_OUT and now back below inventory
           d.status = CASE
             WHEN d.status = 'SOLD_OUT' AND (d.currentOrders - 1) < d.inventory
             THEN 'ACTIVE'
             ELSE d.status
           END
       RETURN o.status AS status, d.id AS dropId`,
      { id: req.params["id"] }
    );

    if (rows.length === 0) return res.status(404).json({ error: "Order not found or already cancelled/confirmed" });

    logger.info({ orderId: req.params["id"] }, "Order cancelled");
    return res.json({ id: req.params["id"], status: "CANCELLED", dropId: rows[0]!.dropId });
  } catch (err) {
    logger.error({ err }, "PATCH /api/orders/:id/cancel failed");
    return res.status(500).json({ error: "Failed to cancel order" });
  }
});

export default router;
