import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { initSchema } from "./lib/schema";
import { closeDriver, getDriver } from "./lib/neo4j";
import healthRouter from "./routes/health";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

// Strict CORS: only Replit-served origins for this project (portal + Expo web
// are same-origin via path routing; Expo dev domain differs).
const allowedOrigins = new Set<string>();
for (const d of (process.env["REPLIT_DOMAINS"] ?? "").split(",")) {
  if (d.trim()) allowedOrigins.add(`https://${d.trim()}`);
}
if (process.env["REPLIT_DEV_DOMAIN"]) allowedOrigins.add(`https://${process.env["REPLIT_DEV_DOMAIN"]}`);
if (process.env["REPLIT_EXPO_DEV_DOMAIN"]) allowedOrigins.add(`https://${process.env["REPLIT_EXPO_DEV_DOMAIN"]}`);

app.use(cors({
  origin(origin, cb) {
    // Same-origin / non-browser requests have no Origin header — allow.
    if (!origin || allowedOrigins.has(origin)) return cb(null, true);
    return cb(null, false);
  },
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const convexIsAuthoritative = process.env["CONVEX_PRODUCTION_MODE"] === "true";
app.use("/api", convexIsAuthoritative ? healthRouter : router);

// ── Neo4j bootstrap ───────────────────────────────────────────────────────
// Only initialise if credentials are present — server still starts without
// them (returns 503 from data routes) so CI and the health check work fine.
const NEO4J_URI = process.env["NEO4J_URI"];
const NEO4J_PASSWORD = process.env["NEO4J_PASSWORD"];

if (!convexIsAuthoritative && NEO4J_URI && NEO4J_PASSWORD) {
  // Warm up the driver and run schema migration in the background.
  // The server is already listening by the time this resolves.
  getDriver(); // establishes pool early
  initSchema().catch((err) => {
    logger.error({ err }, "Neo4j schema init failed — routes will return 503 until resolved");
  });
} else if (convexIsAuthoritative) {
  logger.info("Convex is authoritative — legacy Neo4j API routes are disabled.");
} else {
  logger.warn(
    "NEO4J_URI / NEO4J_PASSWORD not set — database routes disabled. " +
    "Set secrets to enable full functionality."
  );
}

// Graceful shutdown
process.on("SIGTERM", async () => {
  await closeDriver();
  process.exit(0);
});

export default app;
