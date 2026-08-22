/**
 * File uploads — replaces routes/uploads.ts + routes/storage.ts's presign
 * dance against GCS. Convex has built-in blob storage: generateUploadUrl()
 * mints a direct-PUT URL, the client uploads, then finalize() records
 * ownership (mirrors the old (:User)-[:OWNS_UPLOAD]->(:Upload) edge) and
 * ctx.storage.getUrl() serves it back out. No object-storage sidecar needed.
 */
import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { parseSessionToken } from "./lib/auth";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 5 * 1024 * 1024;

export const generateUploadUrl = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const session = await parseSessionToken(sessionToken);
    if (!session) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Not authenticated" });
    return ctx.storage.generateUploadUrl();
  },
});

export const finalize = mutation({
  args: {
    sessionToken: v.string(),
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.string(),
    size: v.number(),
  },
  handler: async (ctx, { sessionToken, storageId, fileName, contentType, size }) => {
    const session = await parseSessionToken(sessionToken);
    if (!session) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Not authenticated" });
    if (!ALLOWED_TYPES.has(contentType)) throw new ConvexError("Only JPEG, PNG, or WEBP allowed");
    if (size > MAX_BYTES) throw new ConvexError("File must be under 5 MB");

    const uploadId = await ctx.db.insert("uploads", {
      userId: session.userId,
      storageId,
      fileName,
      contentType,
    });
    const url = await ctx.storage.getUrl(storageId);
    return { uploadId, url };
  },
});

/** Owner-or-ADMIN gated read — mirrors GET /api/storage/objects/*. */
export const getSignedUrl = query({
  args: { sessionToken: v.string(), uploadId: v.id("uploads") },
  handler: async (ctx, { sessionToken, uploadId }) => {
    const session = await parseSessionToken(sessionToken);
    if (!session) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Not authenticated" });
    const upload = await ctx.db.get(uploadId);
    if (!upload) throw new ConvexError({ code: "NOT_FOUND", message: "Object not found" });
    if (upload.userId !== session.userId && session.role !== "ADMIN") {
      throw new ConvexError({ code: "FORBIDDEN", message: "Forbidden" });
    }
    return ctx.storage.getUrl(upload.storageId);
  },
});
