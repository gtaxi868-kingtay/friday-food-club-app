/** Internal-only helper query — lets Actions (no ctx.db) reuse the same
 *  requireVerifiedChef gate that queries/mutations call directly. */
import { internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { parseSessionToken, requireVerifiedChef } from "./auth";

export const assertVerifiedChef = internalQuery({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const session = await parseSessionToken(sessionToken);
    if (!session) throw new Error("Not authenticated");
    await requireVerifiedChef(ctx, session);
    return null;
  },
});
