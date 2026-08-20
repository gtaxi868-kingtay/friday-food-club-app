/**
 * Uploads API — presigned URL generation for chef verification documents
 *
 * POST /api/uploads/image — authenticated users request a presigned PUT URL
 *                           for direct-to-GCS upload (JPEG / PNG / WEBP, max 5 MB)
 *
 * Ownership is recorded in Neo4j so the private object serve endpoint
 * can enforce access control (owner or ADMIN only).
 */
import { Router } from "express";
import { z } from "zod";
import { requireAuth, type SessionUser } from "./auth";
import { ObjectStorageService } from "../lib/objectStorage";
import { runWrite } from "../lib/neo4j";
import { logger } from "../lib/logger";

const router = Router();
const objectStorageService = new ObjectStorageService();

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

const UploadRequestSchema = z.object({
  name:        z.string().min(1).max(200),
  size:        z.number().int().positive().max(MAX_BYTES, "File must be under 5 MB"),
  contentType: z.string().refine(t => ALLOWED_TYPES.has(t), { message: "Only JPEG, PNG, or WEBP allowed" }),
});

router.post("/image", requireAuth(), async (req, res) => {
  const session = (req as any).session as SessionUser;

  const parse = UploadRequestSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: "Validation failed", issues: parse.error.issues });
  }

  try {
    const { name, size, contentType } = parse.data;
    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

    // Record ownership so the secure serve endpoint can enforce access control.
    // The Upload node acts as an ownership ledger — no sensitive data stored here.
    await runWrite(
      `MATCH (u:User {id: $userId})
       MERGE (up:Upload {objectPath: $objectPath})
       ON CREATE SET up.ownerId = $userId, up.contentType = $contentType,
                     up.fileName = $fileName, up.createdAt = datetime()
       MERGE (u)-[:OWNS_UPLOAD]->(up)`,
      { userId: session.userId, objectPath, contentType, fileName: name }
    );

    logger.info({ userId: session.userId, name, size, contentType, objectPath }, "Upload URL issued");
    return res.json({ uploadURL, objectPath, metadata: { name, size, contentType } });
  } catch (err) {
    logger.error({ err }, "POST /api/uploads/image failed");
    return res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

export default router;
