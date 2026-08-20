/**
 * NFC Scan resolution
 *
 * POST /api/nfc/scan — resolves an NFC tap to a set of drops
 *
 * Two use-cases:
 *   type = 'location'  — member tapped an NFC tag at a pinned spot.
 *                        Returns active drops from chefs pinned at that Location.
 *   type = 'keychain'  — member tapped their personal NFC keychain.
 *                        The nfcId matches their User.nfcId; returns active drops
 *                        from chefs they have favorited.
 *
 * The nfcId is written to Location nodes (via admin portal) or to User nodes
 * (assigned when a keychain ships).  We check both in one query and return
 * whichever matches — the caller must provide the `type` hint so the UI
 * knows which experience to render.
 */
import { Router } from "express";
import { z } from "zod";
import { runRead, toNumber } from "../lib/neo4j";
import { logger } from "../lib/logger";

const router = Router();

const ScanSchema = z.object({
  nfcId: z.string().min(1).max(120),
  type: z.enum(["location", "keychain"]),
});

// ── POST /api/nfc/scan ────────────────────────────────────────────────────────

router.post("/scan", async (req, res) => {
  const parse = ScanSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: "Validation failed", issues: parse.error.issues });

  const { nfcId, type } = parse.data;

  try {
    if (type === "location") {
      // Find the Location node whose nfcId matches, then surface active drops
      // from any Chef pinned at that location.
      const locationRows = await runRead<Record<string, unknown>>(
        `MATCH (l:Location {nfcId: $nfcId})
         RETURN l.id AS id, l.name AS name, l.address AS address, l.region AS region`,
        { nfcId }
      );

      if (locationRows.length === 0) {
        return res.status(404).json({ error: "No location found for this NFC tag" });
      }

      const location = locationRows[0]!;

      // Get active drops from chefs pinned at this location
      const dropRows = await runRead<Record<string, unknown>>(
        `MATCH (l:Location {nfcId: $nfcId})<-[:PINNED_AT]-(c:Chef)-[:POSTED]->(d:Drop)
         WHERE d.status IN ['ACTIVE', 'UNLOCKED'] AND d.expiresAt > datetime()
         RETURN
           d.id AS id, d.title AS title, d.description AS description,
           d.mealSlot AS mealSlot, d.price AS price, d.inventory AS inventory,
           d.minOrders AS minOrders, d.currentOrders AS currentOrders,
           d.status AS status, d.pickupLocation AS pickupLocation,
           d.expiresAt AS expiresAt, d.imageIndex AS imageIndex,
           d.imageUrl AS imageUrl, d.tags AS tags, d.createdAt AS createdAt,
           coalesce(d.isSecret, false) AS isSecret,
           {
             id: c.id, name: c.name, handle: c.handle,
             cuisine: c.cuisine, region: c.region, isVerified: c.isVerified,
             rating: c.rating, totalDrops: c.totalDrops,
             successfulDrops: c.successfulDrops, points: c.points, rank: c.rank
           } AS chef
         ORDER BY d.expiresAt ASC`,
        { nfcId }
      );

      const drops = dropRows.map(r => normalise(r));
      return res.json({
        type: "location",
        location: { id: location["id"], name: location["name"], address: location["address"], region: location["region"] },
        drops,
        total: drops.length,
      });
    }

    // type === 'keychain'
    // Find the User whose nfcId matches, return drops from their favorited chefs
    const userRows = await runRead<Record<string, unknown>>(
      `MATCH (u:User {nfcId: $nfcId})
       RETURN u.id AS id, u.name AS name`,
      { nfcId }
    );

    if (userRows.length === 0) {
      return res.status(404).json({ error: "No member found for this keychain" });
    }

    const member = userRows[0]!;

    const dropRows = await runRead<Record<string, unknown>>(
      `MATCH (u:User {nfcId: $nfcId})-[:FAVORITED]->(c:Chef)-[:POSTED]->(d:Drop)
       WHERE d.status IN ['ACTIVE', 'UNLOCKED'] AND d.expiresAt > datetime()
       RETURN
         d.id AS id, d.title AS title, d.description AS description,
         d.mealSlot AS mealSlot, d.price AS price, d.inventory AS inventory,
         d.minOrders AS minOrders, d.currentOrders AS currentOrders,
         d.status AS status, d.pickupLocation AS pickupLocation,
         d.expiresAt AS expiresAt, d.imageIndex AS imageIndex,
         d.imageUrl AS imageUrl, d.tags AS tags, d.createdAt AS createdAt,
         coalesce(d.isSecret, false) AS isSecret,
         {
           id: c.id, name: c.name, handle: c.handle,
           cuisine: c.cuisine, region: c.region, isVerified: c.isVerified,
           rating: c.rating, totalDrops: c.totalDrops,
           successfulDrops: c.successfulDrops, points: c.points, rank: c.rank
         } AS chef
       ORDER BY d.expiresAt ASC`,
      { nfcId }
    );

    const drops = dropRows.map(r => normalise(r));
    return res.json({
      type: "keychain",
      member: { id: member["id"], name: member["name"] },
      drops,
      total: drops.length,
    });
  } catch (err) {
    logger.error({ err }, "POST /api/nfc/scan failed");
    return res.status(500).json({ error: "NFC scan resolution failed" });
  }
});

function normalise(r: Record<string, unknown>): Record<string, unknown> {
  const out = { ...r };
  for (const k of ["price", "inventory", "minOrders", "currentOrders", "imageIndex"]) {
    if (out[k] !== undefined && out[k] !== null) out[k] = toNumber(out[k]);
  }
  if (out["chef"] && typeof out["chef"] === "object") {
    const c = { ...(out["chef"] as Record<string, unknown>) };
    for (const k of ["totalDrops", "successfulDrops", "points", "rank", "rating"]) {
      if (c[k] !== undefined) c[k] = toNumber(c[k]);
    }
    out["chef"] = c;
  }
  if (out["expiresAt"] && typeof (out["expiresAt"] as any)?.toString === "function") {
    out["expiresAt"] = (out["expiresAt"] as any).toString();
  }
  if (out["inventory"] !== undefined && out["currentOrders"] !== undefined) {
    out["remaining"] = Math.max(0, (out["inventory"] as number) - (out["currentOrders"] as number));
  }
  return out;
}

export default router;
