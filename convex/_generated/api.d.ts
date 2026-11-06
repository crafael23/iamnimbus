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
import type * as _lib_github from "../_lib/github.js";
import type * as _lib_guestToken from "../_lib/guestToken.js";
import type * as _lib_knowledge from "../_lib/knowledge.js";
import type * as _lib_namespaces from "../_lib/namespaces.js";
import type * as _lib_persona from "../_lib/persona.js";
import type * as _lib_rag from "../_lib/rag.js";
import type * as _lib_rateLimits from "../_lib/rateLimits.js";
import type * as _lib_slug from "../_lib/slug.js";
import type * as auth from "../auth.js";
import type * as authInternal from "../authInternal.js";
import type * as blog_mutations from "../blog/mutations.js";
import type * as blog_queries from "../blog/queries.js";
import type * as chat_actions from "../chat/actions.js";
import type * as chat_agent from "../chat/agent.js";
import type * as chat_mutations from "../chat/mutations.js";
import type * as chat_queries from "../chat/queries.js";
import type * as chat_threads from "../chat/threads.js";
import type * as github_actions from "../github/actions.js";
import type * as github_mutations from "../github/mutations.js";
import type * as github_queries from "../github/queries.js";
import type * as http from "../http.js";
import type * as knowledge_actions from "../knowledge/actions.js";
import type * as knowledge_mutations from "../knowledge/mutations.js";
import type * as knowledge_queries from "../knowledge/queries.js";
import type * as projects_mutations from "../projects/mutations.js";
import type * as projects_queries from "../projects/queries.js";
import type * as prompts_mutations from "../prompts/mutations.js";
import type * as prompts_queries from "../prompts/queries.js";
import type * as seed_internal from "../seed/internal.js";
import type * as users_internal from "../users/internal.js";
import type * as users_queries from "../users/queries.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "_lib/auth": typeof _lib_auth;
  "_lib/customFunctions": typeof _lib_customFunctions;
  "_lib/github": typeof _lib_github;
  "_lib/guestToken": typeof _lib_guestToken;
  "_lib/knowledge": typeof _lib_knowledge;
  "_lib/namespaces": typeof _lib_namespaces;
  "_lib/persona": typeof _lib_persona;
  "_lib/rag": typeof _lib_rag;
  "_lib/rateLimits": typeof _lib_rateLimits;
  "_lib/slug": typeof _lib_slug;
  auth: typeof auth;
  authInternal: typeof authInternal;
  "blog/mutations": typeof blog_mutations;
  "blog/queries": typeof blog_queries;
  "chat/actions": typeof chat_actions;
  "chat/agent": typeof chat_agent;
  "chat/mutations": typeof chat_mutations;
  "chat/queries": typeof chat_queries;
  "chat/threads": typeof chat_threads;
  "github/actions": typeof github_actions;
  "github/mutations": typeof github_mutations;
  "github/queries": typeof github_queries;
  http: typeof http;
  "knowledge/actions": typeof knowledge_actions;
  "knowledge/mutations": typeof knowledge_mutations;
  "knowledge/queries": typeof knowledge_queries;
  "projects/mutations": typeof projects_mutations;
  "projects/queries": typeof projects_queries;
  "prompts/mutations": typeof prompts_mutations;
  "prompts/queries": typeof prompts_queries;
  "seed/internal": typeof seed_internal;
  "users/internal": typeof users_internal;
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
  rag: import("@convex-dev/rag/_generated/component.js").ComponentApi<"rag">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
