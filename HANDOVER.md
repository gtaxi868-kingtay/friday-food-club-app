# Friday Food Club — Codex Handover

## Purpose

This document is the implementation brief for taking the current Friday Food
Club project from a working MVP to a production-ready launch. Give this file
to Codex together with the project source.

## Product overview

Friday Food Club has three connected parts:

- `artifacts/mobile` — Expo/React Native member and chef app
- `artifacts/api-server` — Express API backed by Neo4j Aura and object storage
- `artifacts/portal` — creator and admin web portal

The main product flows already implemented include:

- Member feed and drop details
- Chef drop creation and My Drops
- Secret Drops with Friday-only server enforcement in
  `America/Port_of_Spain`
- Preorders with DIGITAL and CASH payment modes
- Atomic inventory decrement and duplicate-order protection
- Chef wallets, escrow/fulfillment logic, and admin credits
- Chef applications and verification
- Favorites backend relationship
- Shop and keychain NFC scan API (physical NFC hardware is not yet wired)
- Object-storage image uploads
- AI marketing copy endpoint for normal and Secret Drops

## Current verified state

- Mobile Expo SDK 54 configuration validates successfully.
- The Expo project is linked through the project ID in
  `artifacts/mobile/app.json`.
- Mobile, API, portal, and component-preview workflows start.
- The API has successfully served `/api/drops` and `/api/chefs`.
- Mobile TypeScript checks previously passed.
- The mobile development workflow uses Expo tunnel mode.
- The current custom mobile build script creates a static Expo bundle. It does
  not create a native APK or AAB.
- This workspace does not contain a local Android SDK, Gradle, or callable EAS
  build command. Use Replit's guided native mobile build flow or the connected
  Expo cloud build flow for the Android artifact.

## Important environment boundary

The source archive intentionally does **not** contain secrets or live service
data. The following must be configured in the target environment:

- `NEO4J_URI`
- `NEO4J_USER`
- `NEO4J_PASSWORD`
- `NEO4J_DATABASE` only if the target Neo4j setup requires it
- `SESSION_SECRET`
- OpenAI integration variables used by the existing AI server package
- Object-storage variables used by the existing upload service
- A stable production API domain

Never put secret values in this file, source control, the ZIP, or the mobile
bundle. The Neo4j database and object-storage files must remain external
services.

## Priority 1 — make the API production-safe

### 1. Add server-side pagination everywhere that can grow

Relevant endpoints include:

- `GET /api/drops`
- chef lists and chef drop lists
- `GET /api/orders`
- admin chef, member, order, and transaction lists
- favorites and discovery lists where applicable

Requirements:

- Enforce a safe server-side maximum, for example 20–50 records.
- Add cursor pagination for feeds and time-ordered lists.
- Do not trust an unlimited client-provided `limit`.
- Return pagination metadata consistently.
- Add indexes that match the new sort/filter patterns.

Acceptance criteria:

- A feed request never returns an unbounded catalog.
- Scrolling/loading the next page does not duplicate or skip records.
- Admin pages remain responsive with large datasets.

### 2. Cache platform configuration

`artifacts/api-server/src/lib/threshold.ts` and routes that call
`getPlatformConfig()` currently read configuration from Neo4j during request
paths. Add a short-lived in-process cache with explicit invalidation after an
admin config update.

Requirements:

- Safe defaults remain available if the cache is cold.
- Admin updates invalidate the cache immediately.
- Do not cache user-specific membership or wallet data.

Acceptance criteria:

- High-volume order requests do not each perform a configuration read.
- A changed fee/discount/wallet threshold takes effect immediately after the
  admin update.

### 3. Move schema migrations out of normal API startup

`artifacts/api-server/src/app.ts` currently initializes the schema in the
background when the server starts. Keep startup safe, but make migrations a
separate one-shot deployment command.

Requirements:

- Add an explicit migration command.
- Make migrations idempotent.
- Run the migration before traffic is sent to a new deployment.
- Prevent multiple app instances from racing migrations.

Acceptance criteria:

- Restarting multiple API instances does not repeat expensive data migrations.
- A failed migration stops deployment clearly instead of leaving a partially
  upgraded service.

### 4. Add shared rate limiting and abuse protection

The current authentication rate limiter is process-local. Replace or extend
it with shared rate limiting suitable for multiple API instances.

Protect at minimum:

- Login attempts
- Guest order attempts
- Order cancellation
- Upload URL creation
- AI marketing requests
- NFC scan requests
- Public feed endpoints

Acceptance criteria:

- Limits apply consistently across API instances.
- A blocked request returns a clear 429 response.
- Normal users are not permanently blocked because of one transient error.

### 5. Add observability and health checks

Keep the existing structured logging and add:

- request latency by route
- error counts by route
- database timeout and pool-acquisition metrics
- object-storage upload failures
- order conflict/sold-out counts
- active database connection count
- deployment/startup health

Acceptance criteria:

- A production operator can identify whether a slowdown is API, Neo4j,
  object storage, or mobile-client related.
- Health checks distinguish process-up from database-ready.

## Priority 2 — protect the order path

The order route is in `artifacts/api-server/src/routes/orders.ts`.

Keep the final inventory and duplicate-order write atomic. Do not replace it
with a client-side count or separate read-then-write sequence.

Improve the path by:

- reducing avoidable pre-check database round trips
- caching platform configuration
- adding an idempotency key for retries after network timeouts
- keeping the database uniqueness constraint on order IDs
- testing simultaneous orders against the final available plate
- testing cancellation followed by reorder
- testing Secret Drops on both Friday and non-Friday dates in Trinidad time

Acceptance criteria:

- Exactly the available inventory can be ordered under concurrent load.
- A retry after an uncertain network response cannot create a second order.
- Duplicate orders remain rejected after cancellation rules are applied.
- The client never shows a false successful order after a failed API response.

## Priority 3 — improve media delivery

Uploads already use object storage, which is the right direction. Do not proxy
large image bytes through the API if the storage provider can issue safe,
time-limited read URLs.

Requirements:

- Keep ownership checks on private uploads.
- Use direct or signed reads where appropriate.
- Add image resizing/thumbnails for feed cards.
- Enforce content type and byte-size checks server-side.
- Add cleanup for abandoned uploads.

Acceptance criteria:

- Feed cards do not download full-resolution images unnecessarily.
- API instances are not used as the bandwidth bottleneck for every image.

## Priority 4 — production deployment and mobile build

Before creating the standalone Android app:

1. Deploy the API server to a stable production domain.
2. Confirm production Neo4j and object storage variables.
3. Run schema migration before enabling traffic.
4. Configure the mobile app with the production API URL, not
   `REPLIT_DEV_DOMAIN`.
5. Test login, feed, image upload, drop creation, preorder, cancellation,
   wallet, and Secret Drop behavior against production.
6. Use Replit's supported native mobile build flow for the linked Expo project.
7. Generate an APK for direct Android installation or an AAB for Play Console
   internal testing.

Do not ship an APK whose API URL points at a temporary development tunnel.

## Required load-test plan

Run these before public launch:

- 100–500 concurrent feed requests
- concurrent ordering for a drop with 1, 5, and 20 remaining plates
- duplicate order retries from the same member
- concurrent admin wallet credits
- concurrent image-upload URL requests
- a large active-drop catalog
- API restart while requests are in flight
- Neo4j timeout/unavailable behavior

Record:

- p50, p95, and p99 latency
- error rate
- order correctness
- database connection-pool wait time
- memory and CPU usage
- object-storage response time

## Security and data checks

Before launch:

- Run the project's security scan.
- Confirm no secrets are bundled in the mobile app.
- Confirm guest IDs cannot be supplied by clients to impersonate users.
- Confirm order and wallet authorization is checked server-side.
- Confirm admin-only routes reject non-admin sessions.
- Confirm upload ownership is enforced when files are served.
- Confirm CORS contains only intended production origins.
- Confirm cookies use secure production settings.
- Confirm logs do not contain passwords, session tokens, or private URLs.

## Definition of done

Codex should consider this handover complete only when:

- All Priority 1 items are implemented.
- The order load-test plan passes without overselling inventory.
- Production API and database connections are configured outside source code.
- Production mobile configuration uses a stable API URL.
- Mobile web preview works against the API.
- An Android APK or AAB is generated through a supported native build flow.
- The generated artifact is installed/tested on a physical Android device.
- A rollback path and database backup/restore procedure are documented.

## Recommended implementation order

1. Pagination
2. Platform configuration cache
3. Separate migrations
4. Shared rate limiting
5. Observability
6. Order idempotency and concurrent load tests
7. Media thumbnails/direct reads
8. Production deployment
9. Native Android build and device test