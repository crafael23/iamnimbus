# WorkOS → Convex Webhook Setup

This guide configures the WorkOS webhook so user and organization membership events sync to your Convex database.

## Prerequisites

- `@convex-dev/workos-authkit` installed and configured
- Convex HTTP routes registered in `convex/http.ts`
- `WORKOS_WEBHOOK_SECRET` set in Convex deployment

## 1. Get Your Webhook URL

Your Convex HTTP endpoint format is:

```
https://<deployment-name>.convex.site/workos/webhook
```

**Current deployments (from Convex MCP):**

- **Dev**: `https://strong-lyrebird-658.convex.site/workos/webhook`
- **Prod**: `https://lovely-lion-752.convex.site/workos/webhook`

## 2. Configure WorkOS Webhook

1. Go to [WorkOS Dashboard](https://dashboard.workos.com/) → **Webhooks**
2. Click **Add Endpoint**
3. Set:
   - **Endpoint URL**: `https://strong-lyrebird-658.convex.site/workos/webhook` (for dev)
   - **Events**: Select `user.created`, `user.updated`, `user.deleted`, `organization_membership.created`, `organization_membership.updated`
4. Click **Create**
5. Copy the **Signing secret** (used for `WORKOS_WEBHOOK_SECRET`)

## 3. Set Environment Variable

```sh
npx convex env set WORKOS_WEBHOOK_SECRET=<your-signing-secret>
```

Already configured for your dev deployment ✓

## 4. Role sync from organization membership

The `organization_membership.created` and `organization_membership.updated` events keep each user's `role` in sync with their WorkOS org membership. When a user is added to an org or their role changes (e.g. member → admin), the webhook updates the `users.role` field. Set user roles in WorkOS Dashboard → Organizations → [org] → Members.

## 5. Auto-add users to an organization (optional)

To automatically add every new signup to a default organization (e.g. `iamnimbus`):

1. **Create the organization** in [WorkOS Dashboard](https://dashboard.workos.com/) → **User Management** → **Organizations** → **Create**
2. Copy the organization ID (e.g. `org_01ABC123...`)
3. Set the Convex env var:

```sh
npx convex env set WORKOS_ORG_ID=org_01ABC123...
```

If `WORKOS_ORG_ID` is not set, the action will log a warning and skip org assignment (no error).

## 6. Verify Setup

- **Convex env vars** (dev): `WORKOS_CLIENT_ID`, `WORKOS_API_KEY`, `WORKOS_ENVIRONMENT_ID`, `WORKOS_WEBHOOK_SECRET`, `WORKOS_ORG_ID` (optional) ✓
- **HTTP routes**: `authKit.registerRoutes(http)` in `convex/http.ts` ✓
- **Event handlers**: `authKit.events()` wired via `authFunctions` in `convex/auth.ts` ✓

## 7. Test the webhook

1. Sign up a new user in your app (or via WorkOS Dashboard)
2. Check Convex Dashboard → Data → `users` table for the new record
3. Optional: Use WorkOS Dashboard → Webhooks → your endpoint → **Send test event**

## Production

When deploying to production, add a separate webhook endpoint in WorkOS for your prod Convex deployment:

- Endpoint: `https://lovely-lion-752.convex.site/workos/webhook`
- Set `WORKOS_WEBHOOK_SECRET` for the prod deployment
