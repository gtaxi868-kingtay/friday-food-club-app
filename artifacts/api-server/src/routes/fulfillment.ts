/**
 * Escrow & QR Fulfillment
 *
 * When an order is placed, funds are held in escrow (order.escrowStatus = 'HELD')
 * and a unique pickup token is generated. The buyer shows the QR (token) at
 * pickup; the chef scans/enters it which releases the escrow split:
 *   chef wallet  += price × (1 - platformFee)
 *   platform     += price × platformFee
 *
 * POST /api/fulfillment/verify        — chef scans buyer QR token
 * GET  /api/fulfillment/ledger        — escrow ledger overview (admin)
 * GET  /api/fulfillment/wallet/:chefId — chef wallet + payout history
 */
import { Router } from "express";
import { z } from "zod";
import { runRead, runWrite, toNumber } from "../lib/neo4j";
import { getPlatformConfig, DEFAULT_WALLET_FREEZE_THRESHOLD } from "../lib/threshold";
import { requireAuth, requireVerifiedChef, type SessionUser } from "./auth";
import { logger } from "../lib/logger";

const router = Router();

/** Resolve the Chef node owned by the authenticated user. */
async function chefIdForSession(session: SessionUser): Promise<string | null> {
  const rows = await runRead<{ chefId: string }>(
    "MATCH (u:User {id: $userId})-[:IS_CHEF]->(c:Chef) RETURN c.id AS chefId",
    { userId: session.userId }
  );
  return rows[0]?.chefId ?? null;
}

// ── POST /api/fulfillment/verify ─────────────────────────────────────────────

const VerifySchema = z.object({
  pickupToken: z.string().min(8),
  chefId: z.string().min(1).optional(), // admin override only; chefs use their own
});

router.post("/verify", requireVerifiedChef(), async (req, res) => {
  const parse = VerifySchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: "Validation failed", issues: parse.error.issues });
  const { pickupToken } = parse.data;
  const session = (req as any).session as SessionUser;

  try {
    // Chefs may only release escrow for their own drops — identity comes from
    // the session, never the request body. Admins may act for a named chef.
    let chefId: string | null;
    if (session.role === "ADMIN" && parse.data.chefId) {
      chefId = parse.data.chefId;
    } else {
      chefId = await chefIdForSession(session);
    }
    if (!chefId) return res.status(403).json({ error: "No chef profile linked to this account" });
    const cfg = await getPlatformConfig();

    // Atomically confirm the order.
    // DIGITAL: escrow released → chef wallet credited with their share.
    // CASH:    chef already collected the full price in cash → platform fee
    //          is DEBITED from chef wallet (may push balance negative).
    const rows = await runWrite<Record<string, unknown>>(
      `MATCH (o:Order {pickupToken: $pickupToken})-[:FOR]->(d:Drop)<-[:POSTED]-(c:Chef {id: $chefId})
       WHERE o.status = 'PENDING' AND o.escrowStatus IN ['HELD', 'CASH']
       WITH o, d, c,
            coalesce(o.paymentMethod, 'DIGITAL') AS payMethod,
            toFloat(o.effectivePrice) AS gross,
            toFloat(o.effectivePrice) * $feeRate AS platformShare,
            toFloat(o.effectivePrice) * (1.0 - $feeRate) AS chefShare
       SET o.status       = 'FULFILLED',
           o.escrowStatus = CASE WHEN payMethod = 'CASH' THEN 'CASH_RECONCILED' ELSE 'RELEASED' END,
           o.fulfilledAt  = datetime(),
           o.chefShare    = CASE WHEN payMethod = 'CASH' THEN gross - platformShare ELSE chefShare END,
           o.platformShare = platformShare,
           o.cashCollected = CASE WHEN payMethod = 'CASH' THEN gross ELSE null END,
           c.walletBalance = CASE
             WHEN payMethod = 'CASH'
             THEN coalesce(c.walletBalance, 0.0) - platformShare
             ELSE coalesce(c.walletBalance, 0.0) + chefShare
           END
       RETURN o.id AS orderId, d.id AS dropId, d.title AS dropTitle,
              payMethod, gross, chefShare, platformShare,
              c.walletBalance AS chefWalletBalance`,
      { pickupToken, chefId, feeRate: cfg.platformFeeRate }
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Invalid token, already fulfilled, or this order is not for your drop" });
    }

    const r = rows[0]!;
    const paymentMethod = String(r["payMethod"] ?? "DIGITAL");
    const isCash = paymentMethod === "CASH";
    logger.info({ orderId: r["orderId"], chefId, paymentMethod }, isCash ? "Cash fee reconciled" : "Escrow released — order fulfilled");
    return res.json({
      orderId: r["orderId"], dropId: r["dropId"], dropTitle: r["dropTitle"],
      paymentMethod,
      gross: toNumber(r["gross"]),
      chefShare: toNumber(r["chefShare"]),
      platformShare: toNumber(r["platformShare"]),
      chefWalletBalance: toNumber(r["chefWalletBalance"]),
      // For cash: the chef collected the full gross, platform fee was debited from wallet
      cashCollected: isCash ? toNumber(r["gross"]) : null,
      status: "FULFILLED",
    });
  } catch (err) {
    logger.error({ err }, "POST /api/fulfillment/verify failed");
    return res.status(500).json({ error: "Verification failed" });
  }
});

// ── GET /api/fulfillment/ledger ──────────────────────────────────────────────

router.get("/ledger", requireAuth("ADMIN"), async (_req, res) => {
  try {
    const rows = await runRead<Record<string, unknown>>(
      `MATCH (o:Order)
       WHERE o.escrowStatus IS NOT NULL
         AND o.escrowStatus <> 'CANCELLED'
         AND o.status <> 'CANCELLED'
       WITH
         // Digital escrow (excludes cancelled orders)
         sum(CASE WHEN o.escrowStatus = 'HELD'
                  THEN toFloat(o.effectivePrice) ELSE 0.0 END)        AS heldInEscrow,
         sum(CASE WHEN o.escrowStatus = 'RELEASED'
                  THEN toFloat(o.chefShare)      ELSE 0.0 END)        AS totalDigitalChefPayouts,
         sum(CASE WHEN o.escrowStatus = 'RELEASED'
                  THEN toFloat(o.platformShare)  ELSE 0.0 END)        AS totalDigitalPlatformRevenue,
         count(CASE WHEN o.escrowStatus = 'HELD'     THEN 1 END)      AS ordersInEscrow,
         count(CASE WHEN o.escrowStatus = 'RELEASED' THEN 1 END)      AS ordersDigitalFulfilled,
         // Cash orders (excludes cancelled orders)
         sum(CASE WHEN o.escrowStatus = 'CASH'
                  THEN toFloat(o.effectivePrice) ELSE 0.0 END)        AS cashOrdersHeld,
         sum(CASE WHEN o.escrowStatus = 'CASH_RECONCILED'
                  THEN toFloat(o.cashCollected)  ELSE 0.0 END)        AS totalCashCollected,
         sum(CASE WHEN o.escrowStatus = 'CASH_RECONCILED'
                  THEN toFloat(o.platformShare)  ELSE 0.0 END)        AS totalCashPlatformRevenue,
         count(CASE WHEN o.escrowStatus = 'CASH'             THEN 1 END) AS cashOrdersPending,
         count(CASE WHEN o.escrowStatus = 'CASH_RECONCILED'  THEN 1 END) AS cashOrdersFulfilled
       RETURN heldInEscrow, totalDigitalChefPayouts, totalDigitalPlatformRevenue,
              ordersInEscrow, ordersDigitalFulfilled,
              cashOrdersHeld, totalCashCollected, totalCashPlatformRevenue,
              cashOrdersPending, cashOrdersFulfilled`
    );
    const r = rows[0] ?? {};
    const totalPlatformRevenue = toNumber(r["totalDigitalPlatformRevenue"] ?? 0) + toNumber(r["totalCashPlatformRevenue"] ?? 0);
    const totalChefPayouts = toNumber(r["totalDigitalChefPayouts"] ?? 0);
    return res.json({
      // Aggregate totals (backwards compatible)
      heldInEscrow: toNumber(r["heldInEscrow"] ?? 0),
      totalChefPayouts,
      totalPlatformRevenue,
      ordersInEscrow: toNumber(r["ordersInEscrow"] ?? 0),
      ordersFulfilled: toNumber(r["ordersDigitalFulfilled"] ?? 0),
      // Cash breakdown
      cash: {
        ordersAwaitingPickup: toNumber(r["cashOrdersPending"] ?? 0),
        ordersFulfilled: toNumber(r["cashOrdersFulfilled"] ?? 0),
        totalCashCollected: toNumber(r["totalCashCollected"] ?? 0),
        totalPlatformFees: toNumber(r["totalCashPlatformRevenue"] ?? 0),
        cashOrdersHeld: toNumber(r["cashOrdersHeld"] ?? 0),
      },
      // Digital breakdown
      digital: {
        ordersInEscrow: toNumber(r["ordersInEscrow"] ?? 0),
        ordersFulfilled: toNumber(r["ordersDigitalFulfilled"] ?? 0),
        totalChefPayouts,
        totalPlatformRevenue: toNumber(r["totalDigitalPlatformRevenue"] ?? 0),
      },
    });
  } catch (err) {
    logger.error({ err }, "GET /api/fulfillment/ledger failed");
    return res.status(500).json({ error: "Failed to fetch ledger" });
  }
});

// ── GET /api/fulfillment/wallet/:chefId ──────────────────────────────────────

router.get("/wallet/:chefId", requireVerifiedChef(), async (req, res) => {
  try {
    const session = (req as any).session as SessionUser;
    if (session.role !== "ADMIN") {
      const ownChefId = await chefIdForSession(session);
      if (ownChefId !== req.params["chefId"]) {
        return res.status(403).json({ error: "Not authorized to view this wallet" });
      }
    }
    // Two passes:
    // 1. All-time aggregate (never truncated — used for Total Earnings dashboard card)
    // 2. Most-recent 25 transactions ordered DESC (used for activity list)
    const [aggRows, txRows] = await Promise.all([
      runRead<{ totalEarnings: unknown; walletBalance: unknown; freezeThreshold: unknown }>(
        `MATCH (c:Chef {id: $chefId})
         OPTIONAL MATCH (cfg:Config {id: 'platform'})
         OPTIONAL MATCH (o:Order)-[:FOR]->(d:Drop)<-[:POSTED]-(c)
         WHERE o.escrowStatus IN ['RELEASED', 'CASH_RECONCILED']
         RETURN c.walletBalance AS walletBalance,
                coalesce(cfg.walletFreezeThreshold, $freezeThreshold) AS freezeThreshold,
                sum(toFloat(coalesce(o.chefShare, 0))) AS totalEarnings`,
        { chefId: req.params["chefId"], freezeThreshold: DEFAULT_WALLET_FREEZE_THRESHOLD }
      ),
      runRead<Record<string, unknown>>(
        `MATCH (c:Chef {id: $chefId})
         MATCH (o:Order)-[:FOR]->(d:Drop)<-[:POSTED]-(c)
         WHERE o.escrowStatus IN ['RELEASED', 'CASH_RECONCILED']
         RETURN o.id AS orderId, d.title AS dropTitle,
                toFloat(o.chefShare) AS chefShare,
                toFloat(o.platformShare) AS platformShare,
                coalesce(o.paymentMethod, 'DIGITAL') AS paymentMethod,
                o.cashCollected AS cashCollected,
                toString(o.fulfilledAt) AS fulfilledAt
         ORDER BY o.fulfilledAt DESC, o.id DESC
         LIMIT 25`,
        { chefId: req.params["chefId"] }
      ),
    ]);
    if (aggRows.length === 0) return res.status(404).json({ error: "Chef not found" });
    const agg = aggRows[0]!;
    const walletBalance = toNumber(agg["walletBalance"] ?? 0);
    const freezeThreshold = toNumber(agg["freezeThreshold"] ?? DEFAULT_WALLET_FREEZE_THRESHOLD);
    const totalEarnings = toNumber(agg["totalEarnings"] ?? 0);
    const transactions = txRows.map(p => ({
      orderId: p["orderId"],
      dropTitle: p["dropTitle"],
      paymentMethod: String(p["paymentMethod"] ?? "DIGITAL"),
      chefShare: toNumber(p["chefShare"]),
      platformShare: toNumber(p["platformShare"]),
      cashCollected: p["cashCollected"] != null ? toNumber(p["cashCollected"]) : null,
      fulfilledAt: p["fulfilledAt"] ?? null,
      // Amount shown in wallet ledger: positive = credit, negative = debit
      walletEffect: String(p["paymentMethod"]) === 'CASH'
        ? -toNumber(p["platformShare"])
        : toNumber(p["chefShare"]),
    }));
    return res.json({
      walletBalance,
      freezeThreshold,
      isFrozen: walletBalance < freezeThreshold,
      cashDebt: walletBalance < 0 ? Math.abs(walletBalance) : 0,
      totalEarnings,          // all-time net chef earnings (digital payouts + cash net shares)
      recentPayouts: transactions,       // backwards compat alias
      recentTransactions: transactions,  // deterministic DESC, max 25
    });
  } catch (err) {
    logger.error({ err }, "GET /api/fulfillment/wallet/:chefId failed");
    return res.status(500).json({ error: "Failed to fetch wallet" });
  }
});

export default router;
