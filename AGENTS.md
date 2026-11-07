# Agent Guidance: Convex Backend

Steering document for organizing and extending the Convex backend in this project.

---

## Folder Structure

```
convex/
├── _generated/           # (auto-generated, do not edit)
├── _lib/                 # Shared utilities – NO query/mutation/action exports
│   ├── auth.ts           # getCurrentUser, getCurrentUserOrNull, requireAdmin
│   └── customFunctions.ts # authedQuery, optionalAuthQuery, adminQuery, authedMutation, adminMutation
├── schema.ts
├── convex.config.ts
├── http.ts
├── auth.config.ts        # WorkOS JWT config
├── auth.ts               # AuthKit setup + event handlers (MUST stay at root)
├── authInternal.ts       # Internal actions (e.g. addUserToOrganization)
├── users/
│   └── queries.ts
├── chat/
│   ├── agent.ts       # Agent definition (Convex AI Gateway model)
│   ├── actions.ts     # createThread, continueThread, generateResponseAsync (streams)
│   ├── mutations.ts   # createThreadMutation, sendMessage
│   ├── queries.ts     # listThreadMessages (streaming)
│   └── threads.ts     # authorizeThreadAccess
├── demo/
│   └── queries.ts
└── migrations/           # convex-helpers migrations
```

---

## Conventions

### 1. Domain organization

- **One folder per domain** (users, demo, blog, portfolio, chat).
- **Split by function type**: `queries.ts`, `mutations.ts`, `actions.ts` (or `internal.ts` for internal-only).
- API paths: `api.users.queries.getMyProfile`, `api.demo.queries.publicGreeting`.

### 2. `_lib/` – shared helpers only

- **No Convex exports** (no `query`, `mutation`, `action`).
- Use for: auth helpers, custom function wrappers, shared validation, pure utilities.
- Import path from domain modules: `from "../_lib/customFunctions"` or `from "../_lib/auth"` (adjust depth by folder).

### 3. Custom functions (convex-helpers)

Use `_lib/customFunctions.ts` wrappers instead of repeating auth logic:

| Wrapper           | Use when                    | Context          |
|-------------------|-----------------------------|------------------|
| `authedQuery`     | User must be logged in      | `ctx.user`       |
| `optionalAuthQuery` | User may be null          | `ctx.user \| null` |
| `adminQuery`      | User must be admin          | `ctx.user`       |
| `authedMutation`  | User must be logged in      | `ctx.user`       |
| `adminMutation`   | User must be admin          | `ctx.user`       |

```typescript
import { authedQuery } from "../_lib/customFunctions";

export const getMyProfile = authedQuery({
  handler: async (ctx) => ({
    _id: ctx.user._id,
    name: ctx.user.name,
    // ...
  }),
});
```

### 4. Auth and WorkOS

- **`auth.ts`** must stay at root. `internal.auth` is required by WorkOS AuthKit.
- **Do not create `auth/` folder** – it causes TS "excessively deep" with `internal.auth`. Use `authInternal.ts` at root for auth-related internal actions.
- Event handlers live in `auth.ts`; internal actions (e.g. add user to org) live in `authInternal.ts`.

### 5. Components

- Auth: `@convex-dev/workos-authkit` (already in use).
- Agent: `@convex-dev/agent` (chat domain, models via the Convex AI Gateway: `convexGateway` from `@convex-dev/ai-sdk-provider`, no provider key).
- Future: `@convex-dev/ratelimiter`, `@convex-dev/rag`, `@convex-dev/storage`.
- Domain logic stays in the main app; components are used as sibling services.

---

## Adding a New Domain

1. Create folder: `convex/<domain>/`
2. Add modules: `queries.ts`, `mutations.ts`, etc.
3. Import custom functions from `_lib/customFunctions` when auth is needed.
4. Use `query` from `_generated/server` for public, unauthenticated queries.
5. Add tables to `schema.ts` as needed.

Example for `blog`:

```
convex/blog/
├── queries.ts      # listPublished, getPost
├── mutations.ts    # create, update, publish
└── ingest.ts       # RAG ingestion action (if applicable)
```

---

## Migrations

- Place migration scripts in `convex/migrations/`.
- Use `convex-helpers/server/migrations` (`makeMigration`).
- Run: `npx convex run migrations:<migrationName>`.

---

## Quick Reference

| Need                    | Location                      |
|-------------------------|-------------------------------|
| Auth helpers            | `_lib/auth.ts`                |
| Auth-aware query/mutation | `_lib/customFunctions.ts`   |
| Domain queries          | `<domain>/queries.ts`         |
| Domain mutations        | `<domain>/mutations.ts`       |
| Internal actions        | `<domain>/internal.ts` or root `*Internal.ts` |
| Auth event handlers     | `auth.ts` (root)              |
| Auth internal actions   | `authInternal.ts` (root)      |

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
