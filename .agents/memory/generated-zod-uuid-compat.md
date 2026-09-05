---
name: Generated Zod UUID compatibility
description: OpenAPI uuid formats currently generate an unsupported helper in this workspace's Zod 3 client
---
OpenAPI `format: uuid` currently generates `zod.uuid()` in the generated Zod client, but this workspace uses a Zod version where that helper is unavailable.

**Why:** A normal API codegen run can pass Orval and still fail the shared library typecheck on this mismatch.

**How to apply:** Prefer a plain string annotation for client-generated request keys unless the workspace Zod/codegen versions are upgraded together.