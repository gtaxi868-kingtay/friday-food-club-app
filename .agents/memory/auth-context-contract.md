---
name: AuthContext contract
description: The mobile AuthContext API — what it exports and where subscription state lives
---

The AuthContext (`artifacts/mobile/contexts/AuthContext.tsx`) is the single source of truth for auth state on mobile.

**Exports via `useAuth()`:**
- `user: AuthUser | null` — id, name, email, role, area, chefId, chefVerified, etc.
- `token: string | null` — Bearer token (also persisted to AsyncStorage under `@ffc_auth_token`)
- `isLoading: boolean`
- `hasClubPass: boolean` — fetched from `GET /subscriptions/:userId` after login; refreshable
- `clubPassExpiry: string | null`
- `login(email, password)` — persists token + user to AsyncStorage; registers push token; checks subscription
- `logout()` — clears storage, calls `POST /auth/logout`
- `refreshSubscription()` — re-fetches subscription state from API
- `authHeaders()` — returns `{ Authorization: "Bearer <token>" }` or `{}` when logged out

**Why:** Studio, create-drop, wallet, and club-pass screens all need auth identity and the Club Pass status. Centralising this avoids duplicate fetch calls across tabs.

**How to apply:** Always import `useAuth` from `@/contexts/AuthContext` — never from AppContext, which only manages drops/orders. Any screen that conditionally shows Club Pass features should read `hasClubPass` from this hook.
