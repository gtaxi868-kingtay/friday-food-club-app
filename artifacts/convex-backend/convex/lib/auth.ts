import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

// Convex's V8 runtime exposes `process.env` for configured environment
// variables but the "DOM" lib we compile against has no ambient `process`.
declare const process: { env: Record<string, string | undefined> };

const SESSION_TTL_MS = 30 * 24 * 3_600_000; // 30 days
const GUEST_TTL_MS = 180 * 24 * 3_600_000; // 180 days

function secret(): string {
  const s = process.env["SESSION_SECRET"] as string | undefined;
  if (!s) throw new ConvexError("SESSION_SECRET is not configured on this deployment");
  return s;
}

async function hmac(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return base64url(new Uint8Array(sig));
}

function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  return atob(b64);
}

export interface SessionUser {
  userId: Id<"users">;
  role: "BUYER" | "CHEF" | "ADMIN";
}

export async function createSessionToken(userId: Id<"users">, role: SessionUser["role"]): Promise<string> {
  const payload = base64url(new TextEncoder().encode(JSON.stringify({ userId, role, exp: Date.now() + SESSION_TTL_MS })));
  return `${payload}.${await hmac(payload)}`;
}

export async function parseSessionToken(token: string | undefined | null): Promise<SessionUser | null> {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  if ((await hmac(payload)) !== sig) return null;
  try {
    const data = JSON.parse(fromBase64url(payload));
    if (typeof data.exp !== "number" || data.exp < Date.now()) return null;
    return { userId: data.userId, role: data.role };
  } catch {
    return null;
  }
}

export async function createGuestToken(guestId: string): Promise<string> {
  const payload = base64url(new TextEncoder().encode(JSON.stringify({ guestId, exp: Date.now() + GUEST_TTL_MS })));
  return `${payload}.${await hmac(payload)}`;
}

export async function parseGuestToken(token: string | undefined | null): Promise<string | null> {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  if ((await hmac(payload)) !== sig) return null;
  try {
    const data = JSON.parse(fromBase64url(payload));
    if (typeof data.exp !== "number" || data.exp < Date.now()) return null;
    return typeof data.guestId === "string" && data.guestId.startsWith("anon_") ? data.guestId : null;
  } catch {
    return null;
  }
}

/** Loads + verifies the session, throws if missing/expired. */
export async function requireSession(
  _ctx: QueryCtx | MutationCtx,
  sessionToken: string | undefined,
): Promise<SessionUser> {
  const session = await parseSessionToken(sessionToken);
  if (!session) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Not authenticated" });
  return session;
}

export function requireRole(session: SessionUser, ...roles: SessionUser["role"][]) {
  if (roles.length > 0 && !roles.includes(session.role)) {
    throw new ConvexError({ code: "FORBIDDEN", message: `Requires role: ${roles.join(" or ")}` });
  }
}

/** Mirrors requireVerifiedChef() from the Express app — CHEF role must map
 *  to a Chef doc with verificationStatus VERIFIED; ADMIN bypasses. */
export async function requireVerifiedChef(ctx: QueryCtx | MutationCtx, session: SessionUser) {
  if (session.role === "ADMIN") return;
  if (session.role !== "CHEF") {
    throw new ConvexError({ code: "FORBIDDEN", message: "Requires role: CHEF or ADMIN" });
  }
  const user = await ctx.db.get(session.userId);
  if (!user?.chefId) {
    throw new ConvexError({ code: "FORBIDDEN", message: "Chef account is not yet verified. Please await admin approval." });
  }
  const chef = await ctx.db.get(user.chefId);
  if (chef?.verificationStatus !== "VERIFIED") {
    throw new ConvexError({ code: "FORBIDDEN", message: "Chef account is not yet verified. Please await admin approval." });
  }
}

// ── password hashing (PBKDF2 via WebCrypto — scryptSync isn't available in
// the Convex V8 runtime, so this intentionally differs from the Express impl.
// Existing Neo4j password hashes are NOT compatible; users re-register.) ────

export async function hashPassword(password: string): Promise<string> {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const salt = base64url(saltBytes);
  const hash = await pbkdf2(password, saltBytes);
  return `${salt}:${hash}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const saltBytes = new TextEncoder().encode(fromBase64url(salt)).length
    ? Uint8Array.from(fromBase64url(salt), (c) => c.charCodeAt(0))
    : new Uint8Array();
  const candidate = await pbkdf2(password, saltBytes);
  return timingSafeEqual(candidate, hash);
}

async function pbkdf2(password: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: 100_000, hash: "SHA-256" },
    key,
    256,
  );
  return base64url(new Uint8Array(bits));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
