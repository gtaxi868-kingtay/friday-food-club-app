---
name: GitHub connector write restriction
description: Environment-specific behavior when using the connected GitHub integration for repository commits
---

The connected GitHub integration can read repository refs, commits, trees, and GraphQL data, but repository write operations may be rejected by a Cloudflare 403 page before GitHub processes them. This can affect Git Data API, GraphQL mutations, and file-content commit endpoints alike.

**Why:** The integration client does not expose a reusable authentication token, so extracting credentials for a manual Git transport is not a safe fallback. A failed write may have created orphaned blob objects, but it does not change the branch unless a ref update or commit mutation succeeds.

**How to apply:** Before attempting a large sync, test one supported write path and verify the branch ref afterward. If the response is the Cloudflare block page, stop and report the provider limitation rather than retrying multiple endpoints or leaving a partial branch update.