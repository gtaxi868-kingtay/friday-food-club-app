/**
 * Auth API — session-cookie auth with RBAC (BUYER | CHEF | ADMIN).
 *
 * POST /api/auth/register  — create account (role BUYER or CHEF; ADMIN seeded)
 * POST /api/auth/login     — verify credentials, set signed session cookie
 * POST /api/auth/logout    — clear session
 * GET  /api/auth/me        — current session user
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { runRead, runWrite } from "../lib/neo4j";
import { logger } from "../lib/logger";

const router = Router();

const SESSION_SECRET = process.env["SESSION_SECRET"] ?? "";
if (!SESSION_SECRET) {
  throw new Error("SESSION_SECRET must be set — refusing to start with an insecure session key");
}
const COOKIE = "ffc_session";
const SESSION_TTL_MS = 30 * 24 * 3_600_000; // 30 days

// ── crypto helpers ───────────────────────────────────────────────────────────

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(candidate, "hex"), Buffer.from(hash, "hex"));
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
}

export function createSessionToken(userId: string, role: string): string {
  const payload = Buffer.from(JSON.stringify({ userId, role, exp: Date.now() + SESSION_TTL_MS })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export interface SessionUser { userId: string; role: "BUYER" | "CHEF" | "ADMIN"; }

export function parseSessionToken(token: string | undefined): SessionUser | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig || sign(payload) !== sig) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof data.exp !== "number" || data.exp < Date.now()) return null;
    return { userId: data.userId, role: data.role };
  } catch { return null; }
}

// ── middleware ───────────────────────────────────────────────────────────────

/** Parses the session if present without rejecting anonymous requests. */
export function getSession(req: Request): SessionUser | null {
  const token = (req as any).cookies?.[COOKIE] ?? req.headers.authorization?.replace(/^Bearer /, "");
  return parseSessionToken(token);
}

// ── guest identity (server-signed — never trust caller-supplied guest IDs) ──

const GUEST_COOKIE = "ffc_guest";
const GUEST_TTL_MS = 180 * 24 * 3_600_000; // 180 days

export function createGuestToken(guestId: string): string {
  const payload = Buffer.from(JSON.stringify({ guestId, exp: Date.now() + GUEST_TTL_MS })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function parseGuestToken(token: string | undefined): string | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig || sign(payload) !== sig) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof data.exp !== "number" || data.exp < Date.now()) return null;
    return typeof data.guestId === "string" && data.guestId.startsWith("anon_") ? data.guestId : null;
  } catch { return null; }
}

/** Verified guest identity from signed cookie or X-Guest-Token header. */
export function getGuestId(req: Request): string | null {
  const token = (req as any).cookies?.[GUEST_COOKIE] ?? (req.headers["x-guest-token"] as string | undefined);
  return parseGuestToken(token);
}

export function setGuestCookie(res: Response, token: string) {
  res.cookie(GUEST_COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: true,
    maxAge: GUEST_TTL_MS, path: "/",
  });
}

export function requireAuth(...roles: SessionUser["role"][]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const token = (req as any).cookies?.[COOKIE] ?? req.headers.authorization?.replace(/^Bearer /, "");
    const session = parseSessionToken(token);
    if (!session) return res.status(401).json({ error: "Not authenticated" });
    if (roles.length > 0 && !roles.includes(session.role)) {
      return res.status(403).json({ error: `Requires role: ${roles.join(" or ")}` });
    }
    (req as any).session = session;
    next();
    return;
  };
}

/**
 * requireVerifiedChef — like requireAuth("CHEF", "ADMIN") but also confirms
 * server-side that the user's Chef node is VERIFIED.
 *
 * This protects against stale CHEF-role tokens issued before a chef was
 * rejected or before the role-demotion migration ran. ADMIN callers are
 * let through without a chef check (admin can always manage drops/fulfillment).
 */
export function requireVerifiedChef() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const token = (req as any).cookies?.[COOKIE] ?? req.headers.authorization?.replace(/^Bearer /, "");
    const session = parseSessionToken(token);
    if (!session) { res.status(401).json({ error: "Not authenticated" }); return; }
    if (session.role !== "CHEF" && session.role !== "ADMIN") {
      res.status(403).json({ error: "Requires role: CHEF or ADMIN" }); return;
    }
    // ADMIN users bypass the chef-verification check
    if (session.role === "ADMIN") {
      (req as any).session = session;
      next();
      return;
    }
    // For CHEF tokens: confirm the linked Chef is VERIFIED in the database.
    // This catches stale tokens issued before a rejection/demotion.
    try {
      const rows = await runRead<{ verified: boolean }>(
        `MATCH (u:User {id: $userId})-[:IS_CHEF]->(c:Chef)
         RETURN c.verificationStatus = 'VERIFIED' AS verified`,
        { userId: session.userId }
      );
      const verified = rows[0]?.verified === true;
      if (!verified) {
        res.status(403).json({ error: "Chef account is not yet verified. Please await admin approval." });
        return;
      }
      (req as any).session = session;
      next();
    } catch (err) {
      res.status(500).json({ error: "Authorization check failed" });
    }
  };
}

function setSessionCookie(res: Response, token: string) {
  res.cookie(COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: true,
    maxAge: SESSION_TTL_MS, path: "/",
  });
}

// ── routes ───────────────────────────────────────────────────────────────────

const RegisterSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(6).max(128),
  // Only BUYER self-registration is supported. Chefs must register as a BUYER
  // first, then apply through the document-upload verification flow.
  // Supplying role:"CHEF" will fail schema validation (HTTP 400).
  role: z.enum(["BUYER"]).default("BUYER"),
  area: z.string().max(80).optional(),   // e.g. Woodbrook, Chaguanas
  lat:  z.number().min(-90).max(90).optional(),   // GPS latitude
  lon:  z.number().min(-180).max(180).optional(),  // GPS longitude
});

router.post("/register", async (req, res) => {
  if (isRateLimited(clientIp(req), registerBuckets, 5, 60 * 60_000)) {
    return res.status(429).json({ error: "Too many registration attempts — please wait before trying again." });
  }
  const parse = RegisterSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: "Validation failed", issues: parse.error.issues });
  const { name, email, password, area, lat, lon } = parse.data;
  const role = "BUYER" as const;

  try {
    const existing = await runRead<{ id: string }>(
      "MATCH (u:User {email: $email}) RETURN u.id AS id", { email: email.toLowerCase() });
    if (existing.length > 0) return res.status(409).json({ error: "An account with this email already exists" });

    const userId = `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const passwordHash = hashPassword(password);

    await runWrite(
      `CREATE (u:User {
         id: $userId, name: $name, email: $email, passwordHash: $passwordHash,
         role: $role, area: $area, walletBalance: 0.0,
         handle: $handle, points: 0, createdAt: datetime(),
         lat: $lat, lon: $lon
       })`,
      {
        userId, name, email: email.toLowerCase(), passwordHash, role,
        area: area ?? null, lat: lat ?? null, lon: lon ?? null,
        handle: `@${name.toLowerCase().replace(/[^a-z0-9]/g, "")}`,
      }
    );

    const token = createSessionToken(userId, role);
    setSessionCookie(res, token);
    logger.info({ userId, role }, "User registered");
    return res.status(201).json({ token, user: { id: userId, name, email: email.toLowerCase(), role, area: area ?? null } });
  } catch (err) {
    logger.error({ err }, "POST /api/auth/register failed");
    return res.status(500).json({ error: "Registration failed" });
  }
});

// ── Simple in-memory rate limiter ────────────────────────────────────────────
// Protects login and register from brute-force / credential stuffing.
// Keyed by client IP; resets after the window expires.

interface RateBucket { count: number; windowStart: number; }
const loginBuckets    = new Map<string, RateBucket>();
const registerBuckets = new Map<string, RateBucket>();

function isRateLimited(
  ip: string,
  buckets: Map<string, RateBucket>,
  maxAttempts: number,
  windowMs: number
): boolean {
  const now = Date.now();
  const bucket = buckets.get(ip);
  if (!bucket || now - bucket.windowStart > windowMs) {
    buckets.set(ip, { count: 1, windowStart: now });
    return false;
  }
  if (bucket.count >= maxAttempts) return true;
  bucket.count++;
  return false;
}

function clientIp(req: import("express").Request): string {
  return (
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
    req.socket.remoteAddress ??
    "unknown"
  );
}

const LoginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

router.post("/login", async (req, res) => {
  if (isRateLimited(clientIp(req), loginBuckets, 10, 15 * 60_000)) {
    return res.status(429).json({ error: "Too many login attempts — please wait 15 minutes before trying again." });
  }
  const parse = LoginSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: "Validation failed" });
  const { email, password } = parse.data;

  try {
    const rows = await runRead<Record<string, unknown>>(
      `MATCH (u:User {email: $email})
       OPTIONAL MATCH (u)-[:IS_CHEF]->(c:Chef)
       RETURN u.id AS id, u.name AS name, u.email AS email, u.role AS role,
              u.area AS area, u.passwordHash AS passwordHash, c.id AS chefId`,
      { email: email.toLowerCase() }
    );
    const user = rows[0];
    if (!user || !verifyPassword(password, String(user["passwordHash"] ?? ""))) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = createSessionToken(String(user["id"]), String(user["role"] ?? "BUYER"));
    setSessionCookie(res, token);
    // Also return raw token in body so mobile clients can store it as a Bearer token
    return res.json({
      token,
      user: {
        id: user["id"], name: user["name"], email: user["email"],
        role: user["role"] ?? "BUYER", area: user["area"], chefId: user["chefId"],
      },
    });
  } catch (err) {
    logger.error({ err }, "POST /api/auth/login failed");
    return res.status(500).json({ error: "Login failed" });
  }
});

router.post("/logout", (_req, res) => {
  res.clearCookie(COOKIE, { path: "/" });
  return res.json({ ok: true });
});

router.get("/me", async (req, res) => {
  const token = (req as any).cookies?.[COOKIE] ?? req.headers.authorization?.replace(/^Bearer /, "");
  const session = parseSessionToken(token);
  if (!session) return res.status(401).json({ error: "Not authenticated" });

  try {
    const rows = await runRead<Record<string, unknown>>(
      `MATCH (u:User {id: $id})
       OPTIONAL MATCH (u)-[:IS_CHEF]->(c:Chef)
       OPTIONAL MATCH (u)-[:HAS_SUBSCRIPTION]->(s:Subscription)
       WHERE s.status = 'ACTIVE' AND s.expiresAt > datetime()
       RETURN u.id AS id, u.name AS name, u.email AS email, u.role AS role,
              u.area AS area, u.walletBalance AS walletBalance,
              c.id AS chefId, c.isVerified AS chefVerified,
              c.verificationStatus AS chefVerificationStatus,
              c.rejectionReason AS chefRejectionReason,
              count(s) > 0 AS isMember`,
      { id: session.userId }
    );
    if (rows.length === 0) return res.status(401).json({ error: "User not found" });
    return res.json({ user: rows[0] });
  } catch (err: any) {
    // When the database is paused/unreachable the query times out.
    // Return 503 so the portal shows the login page within seconds
    // rather than displaying an infinite spinner for ~15 minutes.
    const isTimeout =
      err?.message?.includes("timed out") ||
      err?.message?.includes("ENOTFOUND") ||
      err?.code === "ServiceUnavailable";
    if (isTimeout) {
      logger.warn("GET /api/auth/me: database unreachable — returning 503");
      return res.status(503).json({
        error: "Database is currently unavailable. Please try again in a moment.",
        code: "DB_UNAVAILABLE",
      });
    }
    logger.error({ err }, "GET /api/auth/me failed");
    return res.status(500).json({ error: "Failed to fetch session" });
  }
});

// POST /api/auth/push-token — store Expo push token for the current user
router.post("/push-token", requireAuth(), async (req, res) => {
  const parse = z.object({ expoPushToken: z.string().min(1).max(200) }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: "expoPushToken is required" });
  const session = (req as any).session as SessionUser;
  try {
    await runWrite(
      "MATCH (u:User {id: $id}) SET u.expoPushToken = $token",
      { id: session.userId, token: parse.data.expoPushToken }
    );
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "POST /api/auth/push-token failed");
    return res.status(500).json({ error: "Failed to store push token" });
  }
});

// PATCH /api/auth/area — set the user's location for the proximity feed
router.patch("/area", requireAuth(), async (req, res) => {
  const parse = z.object({ area: z.string().min(2).max(80) }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: "Invalid area" });
  const session = (req as any).session as SessionUser;
  try {
    await runWrite("MATCH (u:User {id: $id}) SET u.area = $area", { id: session.userId, area: parse.data.area });
    return res.json({ ok: true, area: parse.data.area });
  } catch (err) {
    logger.error({ err }, "PATCH /api/auth/area failed");
    return res.status(500).json({ error: "Failed to update area" });
  }
});

export default router;
