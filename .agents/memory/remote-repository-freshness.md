---
name: Remote repository freshness
description: The linked GitHub repository can be newer than the local workspace and may contain a different backend architecture.
---

When a user provides a repository URL and disputes the local codebase, inspect the remote repository before drawing architectural conclusions. Treat the remote snapshot and the local workspace as potentially different revisions until compared.

**Why:** The GitHub version of this product contains a Convex backend and Convex client wiring that were absent from the stale local checkout.

**How to apply:** Check the remote tree, package manifests, environment configuration, and client providers. Clearly label findings as local-workspace or remote-repository findings.