---
name: convex-dev-workos-authkit
description: Sync WorkOS AuthKit authentication events and user data directly into your Convex database with pre-built webhooks and queries. Use when working with auth features, WorkOS AuthKit.
---

# WorkOS AuthKit

## Instructions

WorkOS AuthKit is a Convex component that provides sync workos authkit authentication events and user data directly into your convex database with pre-built webhooks and queries.

### Installation

```bash
npm install @convex-dev/workos-authkit
```

### Capabilities

- Eliminate manual webhook setup with pre-configured WorkOS AuthKit event handlers
- Keep user authentication state automatically synchronized between WorkOS and Convex
- Access user profiles and organization data directly from Convex queries without API calls
- Handle authentication events like user signups and profile updates with built-in actions

## Examples

### how to sync WorkOS users to Convex database

The @convex-dev/workos-authkit component automatically syncs user data from WorkOS AuthKit to your Convex database through webhook handlers. It creates and updates user records when authentication events occur, keeping your local user data in sync without manual API calls.

### WorkOS webhook integration with Convex

This component provides pre-built webhook endpoints that handle WorkOS AuthKit events like user creation, updates, and deletions. The webhooks automatically trigger Convex actions to update your database, eliminating the need to write custom webhook parsing logic.

### access WorkOS user data in Convex queries

After syncing with @convex-dev/workos-authkit, you can query WorkOS user profiles and organization data directly from Convex without external API calls. The component stores user attributes, roles, and organization memberships in your Convex database for fast local access.

## Troubleshooting

**How does WorkOS AuthKit component handle user data synchronization?**

The @convex-dev/workos-authkit component uses WorkOS webhooks to automatically sync user data to your Convex database. When users sign up, update profiles, or change organizations in WorkOS, the component receives webhook events and updates the corresponding records in Convex through built-in actions.

**What WorkOS AuthKit events are supported by this component?**

The component handles standard WorkOS AuthKit events including user creation, profile updates, organization membership changes, and user deletions. Each event type triggers corresponding Convex actions that maintain data consistency between WorkOS and your Convex database.

**Can I customize how WorkOS user data is stored in Convex?**

Yes, the @convex-dev/workos-authkit component allows you to customize the database schema and data transformation logic. You can modify which user attributes are stored, add custom fields, and define how organization data maps to your Convex tables while maintaining the automatic synchronization.

**Does this component require specific Convex schema setup?**

The @convex-dev/workos-authkit component includes recommended schema definitions for storing WorkOS user and organization data in Convex. You can use the provided schemas or adapt them to fit your existing database structure while ensuring compatibility with the synchronization actions.

## Resources

- [npm package](https://www.npmjs.com/package/%40convex-dev%2Fworkos-authkit)
- [GitHub repository](https://github.com/get-convex/workos-authkit)
- [Convex Components Directory](https://www.convex.dev/components/workos-authkit)
- [Convex documentation](https://docs.convex.dev)
