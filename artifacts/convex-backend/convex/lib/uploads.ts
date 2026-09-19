import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

/** imageUploadId points at our own `uploads` table, not Convex's raw
 *  `_storage` id directly — resolve through the upload doc to get a
 *  servable URL, or null if the upload was somehow deleted. */
export async function resolveUploadUrl(ctx: QueryCtx, uploadId: Id<"uploads"> | undefined): Promise<string | null> {
  if (!uploadId) return null;
  const upload = await ctx.db.get(uploadId);
  if (!upload) return null;
  return ctx.storage.getUrl(upload.storageId);
}
