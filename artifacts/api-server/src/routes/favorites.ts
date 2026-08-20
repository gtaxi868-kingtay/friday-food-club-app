/**
 * Chef Favorites
 *
 * GET    /api/favorites          — list chefs the authenticated user has favorited
 * POST   /api/favorites/:chefId  — favorite a chef
 * DELETE /api/favorites/:chefId  — unfavorite a chef
 */
import { Router } from "express";
import { runRead, runWrite, toNumber } from "../lib/neo4j";
import { requireAuth, getSession } from "./auth";
import { logger } from "../lib/logger";

const router = Router();

// ── GET /api/favorites ────────────────────────────────────────────────────────

router.get("/", requireAuth(), async (req, res) => {
  const session = getSession(req)!;
  try {
    const rows = await runRead<Record<string, unknown>>(
      `MATCH (u:User {id: $userId})-[:FAVORITED]->(c:Chef)
       RETURN c.id AS id, c.name AS name, c.handle AS handle,
              c.cuisine AS cuisine, c.region AS region,
              c.isVerified AS isVerified, c.rating AS rating,
              c.totalDrops AS totalDrops, c.successfulDrops AS successfulDrops,
              c.points AS points, c.rank AS rank
       ORDER BY c.name ASC`,
      { userId: session.userId }
    );
    const chefs = rows.map(r => ({
      ...r,
      rating: toNumber(r["rating"]),
      totalDrops: toNumber(r["totalDrops"]),
      successfulDrops: toNumber(r["successfulDrops"]),
      points: toNumber(r["points"]),
      rank: toNumber(r["rank"]),
    }));
    return res.json({ chefs, total: chefs.length });
  } catch (err) {
    logger.error({ err }, "GET /api/favorites failed");
    return res.status(500).json({ error: "Failed to fetch favorites" });
  }
});

// ── POST /api/favorites/:chefId ───────────────────────────────────────────────

router.post("/:chefId", requireAuth(), async (req, res) => {
  const session = getSession(req)!;
  const { chefId } = req.params;
  try {
    const chefCheck = await runRead("MATCH (c:Chef {id: $chefId}) RETURN true AS ok", { chefId });
    if (chefCheck.length === 0) return res.status(404).json({ error: "Chef not found" });

    await runWrite(
      `MATCH (u:User {id: $userId}), (c:Chef {id: $chefId})
       MERGE (u)-[:FAVORITED]->(c)`,
      { userId: session.userId, chefId }
    );
    return res.json({ favorited: true, chefId });
  } catch (err) {
    logger.error({ err }, "POST /api/favorites/:chefId failed");
    return res.status(500).json({ error: "Failed to favorite chef" });
  }
});

// ── DELETE /api/favorites/:chefId ─────────────────────────────────────────────

router.delete("/:chefId", requireAuth(), async (req, res) => {
  const session = getSession(req)!;
  const { chefId } = req.params;
  try {
    await runWrite(
      `MATCH (u:User {id: $userId})-[r:FAVORITED]->(c:Chef {id: $chefId})
       DELETE r`,
      { userId: session.userId, chefId }
    );
    return res.json({ favorited: false, chefId });
  } catch (err) {
    logger.error({ err }, "DELETE /api/favorites/:chefId failed");
    return res.status(500).json({ error: "Failed to unfavorite chef" });
  }
});

export default router;
