---
name: WiPay adapter boundary
description: Payment checkout and webhook integration must remain behind a configured merchant adapter until the exact WiPay contract is confirmed.
---

The app-owned payment contract should only accept a hosted checkout URL and normalized payment status after the merchant-specific WiPay request and callback formats have been verified.

**Why:** The available official lookup did not return the merchant API contract, and guessing provider fields or callback signatures would make a payment flow appear successful without reliable settlement verification.

**How to apply:** Keep provider credentials and URLs in environment secrets, verify webhook signatures before Convex mutations, and do not mark orders or Club Passes paid from a browser redirect alone.