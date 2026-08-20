/**
 * Expo Push Notification utility
 *
 * Sends push notifications via the Expo Push API.
 * Tokens are stored on User nodes as `expoPushToken`.
 * Fire-and-forget — errors are logged but never thrown.
 */
import { logger } from "./logger";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  badge?: number;
}

/**
 * Returns true when the token string is a valid Expo push token.
 * Accepts both the current format (ExpoPushToken[...]) and the
 * legacy format (ExponentPushToken[...]) so that tokens produced
 * by any Expo SDK version are eligible for dispatch.
 */
export function isValidExpoPushToken(token: string | null | undefined): token is string {
  if (typeof token !== "string") return false;
  return /^Expo(nent)?PushToken\[.+\]$/.test(token);
}

/**
 * Send one or more Expo push messages.
 * Returns true if all tickets were accepted, false otherwise (non-fatal).
 */
export async function sendExpoPush(messages: PushMessage[]): Promise<boolean> {
  if (messages.length === 0) return true;

  // Filter out tokens that do not match either valid Expo push token format
  const valid = messages.filter(m => isValidExpoPushToken(m.to));
  if (valid.length === 0) {
    logger.warn("sendExpoPush: no valid Expo push tokens — skipping");
    return false;
  }

  // 5-second timeout so a slow/unresponsive Expo push service never stalls
  // the admin verify/reject response
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(valid.length === 1 ? valid[0] : valid),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logger.warn({ status: res.status, text }, "Expo push API returned non-OK status");
      return false;
    }

    const json = (await res.json()) as { data?: { status: string; message?: string }[] };
    const tickets = Array.isArray(json.data) ? json.data : [];
    const errors = tickets.filter(t => t.status === "error");
    if (errors.length > 0) {
      logger.warn({ errors }, "Expo push: some tickets errored");
    }
    return errors.length === 0;
  } catch (err) {
    logger.warn({ err }, "sendExpoPush: network error sending push notification");
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
