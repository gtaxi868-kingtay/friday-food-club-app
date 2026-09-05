---
name: Neo4j Aura database name
description: Aura instances don't use the database name "neo4j" — omit it to get the home database
---

# Neo4j Aura — Database Name Quirk

## Rule
Never hardcode `database: "neo4j"` in `getDriver().session()` calls. Aura free-tier instances use a custom database name, not `"neo4j"`. Omitting the `database` option (or passing `undefined`) hits the home database correctly on all tiers.

**Why:** First attempt used `{ database: "neo4j" }` and threw `Neo.ClientError.Database.DatabaseNotFound` immediately. Removing the hardcoded name and optionally reading from `NEO4J_DATABASE` env var fixed it.

**How to apply:** In `artifacts/api-server/src/lib/neo4j.ts`, both `runRead` and `runWrite` use:
```ts
const database = process.env["NEO4J_DATABASE"] || undefined;
const session = getDriver().session(database ? { database } : {});
```
If a specific database name is ever needed, set `NEO4J_DATABASE` in secrets.

## Stack
- `neo4j-driver` v6.x in `@workspace/api-server`
- Credentials in secrets: `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`
- `connectionAcquisitionTimeout` warning is cosmetic — safe to ignore
