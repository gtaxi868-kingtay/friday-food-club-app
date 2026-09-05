---
name: Mobile Convex environment variable
description: Expo and Vite use different public environment variable names for the shared Convex deployment.
---

The Expo mobile app requires `EXPO_PUBLIC_CONVEX_URL`; configuring only the web app's `VITE_CONVEX_URL` leaves the native preview unable to construct its Convex client.

**Why:** Expo can start Metro successfully while the app still crashes immediately at runtime when the Convex URL is undefined.

**How to apply:** Whenever the Convex deployment URL changes, update both public environment variables through environment tooling and restart the mobile workflow.