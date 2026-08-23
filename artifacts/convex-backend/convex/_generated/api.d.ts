/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as ai from "../ai.js";
import type * as auth from "../auth.js";
import type * as chefs from "../chefs.js";
import type * as config from "../config.js";
import type * as dishes from "../dishes.js";
import type * as drops from "../drops.js";
import type * as favorites from "../favorites.js";
import type * as fulfillment from "../fulfillment.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_session from "../lib/session.js";
import type * as locations from "../locations.js";
import type * as nfc from "../nfc.js";
import type * as orders from "../orders.js";
import type * as seed from "../seed.js";
import type * as subscriptions from "../subscriptions.js";
import type * as uploads from "../uploads.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  ai: typeof ai;
  auth: typeof auth;
  chefs: typeof chefs;
  config: typeof config;
  dishes: typeof dishes;
  drops: typeof drops;
  favorites: typeof favorites;
  fulfillment: typeof fulfillment;
  "lib/auth": typeof lib_auth;
  "lib/session": typeof lib_session;
  locations: typeof locations;
  nfc: typeof nfc;
  orders: typeof orders;
  seed: typeof seed;
  subscriptions: typeof subscriptions;
  uploads: typeof uploads;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
