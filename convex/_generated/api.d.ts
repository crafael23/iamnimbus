/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as _lib_auth from "../_lib/auth.js";
import type * as _lib_customFunctions from "../_lib/customFunctions.js";
import type * as auth from "../auth.js";
import type * as authInternal from "../authInternal.js";
import type * as chat_actions from "../chat/actions.js";
import type * as chat_agent from "../chat/agent.js";
import type * as chat_mutations from "../chat/mutations.js";
import type * as chat_queries from "../chat/queries.js";
import type * as chat_threads from "../chat/threads.js";
import type * as demo_queries from "../demo/queries.js";
import type * as http from "../http.js";
import type * as users_queries from "../users/queries.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "_lib/auth": typeof _lib_auth;
  "_lib/customFunctions": typeof _lib_customFunctions;
  auth: typeof auth;
  authInternal: typeof authInternal;
  "chat/actions": typeof chat_actions;
  "chat/agent": typeof chat_agent;
  "chat/mutations": typeof chat_mutations;
  "chat/queries": typeof chat_queries;
  "chat/threads": typeof chat_threads;
  "demo/queries": typeof demo_queries;
  http: typeof http;
  "users/queries": typeof users_queries;
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

export declare const components: {
  workOSAuthKit: import("@convex-dev/workos-authkit/_generated/component.js").ComponentApi<"workOSAuthKit">;
  agent: import("@convex-dev/agent/_generated/component.js").ComponentApi<"agent">;
};
