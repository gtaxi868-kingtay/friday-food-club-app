import { ConvexError } from "convex/values";

// Convex's V8 runtime exposes `process.env` for configured environment
// variables but the "DOM" lib we compile against has no ambient `process`.
declare const process: { env: Record<string, string | undefined> };

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new ConvexError({ code: "AUTH_NOT_CONFIGURED", message: `Missing Convex environment variable ${name}` });
  return value;
}

export interface VerifiedIdentity {
  email: string;
  name: string | null;
  providerUserId: string;
}

/** Accepts a comma-separated env var of every client ID this app issues
 *  tokens for (iOS/Android/Web can each get their own from Google). */
function allowedGoogleAudiences(): string[] {
  return requireEnv("GOOGLE_CLIENT_IDS").split(",").map((s) => s.trim()).filter(Boolean);
}

/** Google publishes a tokeninfo endpoint that verifies signature, issuer,
 *  and expiry server-side — no need to fetch/cache JWKS ourselves. We only
 *  need to additionally check the audience against our own client IDs. */
export async function verifyGoogleIdToken(idToken: string): Promise<VerifiedIdentity> {
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  if (!response.ok) throw new ConvexError({ code: "INVALID_TOKEN", message: "Google could not verify this sign-in" });
  const claims = (await response.json()) as Record<string, string>;

  const audiences = allowedGoogleAudiences();
  if (!audiences.includes(claims.aud)) {
    throw new ConvexError({ code: "INVALID_TOKEN", message: "This sign-in was issued for a different app" });
  }
  if (claims.email_verified !== "true" || !claims.email) {
    throw new ConvexError({ code: "INVALID_TOKEN", message: "Google account email is not verified" });
  }
  return { email: claims.email.toLowerCase(), name: claims.name ?? null, providerUserId: claims.sub };
}

// ── Apple ────────────────────────────────────────────────────────────────
// Apple has no tokeninfo endpoint, so the ID token (a standard RS256 JWT)
// is verified by hand against Apple's published JWKS using WebCrypto —
// same primitive already used for session HMACs in lib/auth.ts, no extra
// dependency needed.

function base64urlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(b64url.length / 4) * 4, "=");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function base64urlToJson(b64url: string): any {
  return JSON.parse(new TextDecoder().decode(base64urlToBytes(b64url)));
}

let appleJwksCache: { keys: any[]; fetchedAt: number } | null = null;

async function getApplePublicKey(kid: string): Promise<JsonWebKey> {
  const now = Date.now();
  if (!appleJwksCache || now - appleJwksCache.fetchedAt > 3_600_000) {
    const response = await fetch("https://appleid.apple.com/auth/keys");
    if (!response.ok) throw new ConvexError({ code: "INVALID_TOKEN", message: "Could not fetch Apple's signing keys" });
    const body = (await response.json()) as { keys: any[] };
    appleJwksCache = { keys: body.keys, fetchedAt: now };
  }
  const key = appleJwksCache.keys.find((k) => k.kid === kid);
  if (!key) throw new ConvexError({ code: "INVALID_TOKEN", message: "Unknown Apple signing key" });
  return key;
}

export async function verifyAppleIdToken(idToken: string): Promise<VerifiedIdentity> {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new ConvexError({ code: "INVALID_TOKEN", message: "Malformed Apple sign-in token" });
  const [headerB64, payloadB64, sigB64] = parts;

  const header = base64urlToJson(headerB64);
  const payload = base64urlToJson(payloadB64);

  if (header.alg !== "RS256") throw new ConvexError({ code: "INVALID_TOKEN", message: "Unexpected Apple token algorithm" });

  const jwk = await getApplePublicKey(header.kid);
  const publicKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );

  const signedData = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = base64urlToBytes(sigB64);
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    publicKey,
    signature.buffer as ArrayBuffer,
    signedData.buffer as ArrayBuffer,
  );
  if (!valid) throw new ConvexError({ code: "INVALID_TOKEN", message: "Apple sign-in token signature is invalid" });

  if (payload.iss !== "https://appleid.apple.com") {
    throw new ConvexError({ code: "INVALID_TOKEN", message: "Unexpected token issuer" });
  }
  if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) {
    throw new ConvexError({ code: "INVALID_TOKEN", message: "Apple sign-in token has expired" });
  }
  const audience = requireEnv("APPLE_CLIENT_ID");
  if (payload.aud !== audience) {
    throw new ConvexError({ code: "INVALID_TOKEN", message: "This sign-in was issued for a different app" });
  }
  if (!payload.email) {
    throw new ConvexError({ code: "INVALID_TOKEN", message: "Apple did not share an email for this account" });
  }
  return { email: String(payload.email).toLowerCase(), name: null, providerUserId: payload.sub };
}
