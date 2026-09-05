import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

declare const process: { env: Record<string, string | undefined> };

const http = httpRouter();

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

http.route({
  path: "/payments/wipay/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.WIPAY_WEBHOOK_SECRET;
    if (!secret) return new Response("Webhook is not configured", { status: 503 });
    const payload = await request.text();
    const signature = request.headers.get("x-wipay-signature") ?? request.headers.get("x-signature") ?? "";
    const expected = await hmacHex(secret, payload);
    if (!constantTimeEqual(signature.toLowerCase(), expected.toLowerCase())) {
      return new Response("Invalid signature", { status: 401 });
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(payload) as Record<string, unknown>;
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    const paymentReference = typeof body.paymentId === "string" ? body.paymentId : typeof body.reference === "string" ? body.reference : null;
    const providerStatus = typeof body.status === "string" ? body.status : typeof body.paymentStatus === "string" ? body.paymentStatus : null;
    if (!paymentReference || !providerStatus) return new Response("Missing payment reference or status", { status: 400 });

    try {
      await ctx.runMutation(internal.payments.applyWebhook, {
        paymentReference,
        providerReference: typeof body.transactionId === "string" ? body.transactionId : undefined,
        providerStatus,
      });
    } catch {
      return new Response("Payment reference not found", { status: 404 });
    }
    return new Response("ok", { status: 200 });
  }),
});

export default http;