import { AuthKit, type AuthFunctions } from "@convex-dev/workos-authkit";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

const authFunctions: AuthFunctions = internal.auth;

// Events arrive straight from the WorkOS webhook. The webhook must subscribe to
// user.created/updated/deleted and organization_membership.created/updated/
// deleted; each event type with a handler in events() below is dispatched to it.
export const authKit = new AuthKit<DataModel>(components.workOSAuthKit, {
	authFunctions,
});

export const { authKitEvent } = authKit.events({
	"user.created": async (ctx, event) => {
    const name =
      [event.data.firstName, event.data.lastName]
        .filter(Boolean)
        .join(" ") ||
      event.data.email?.split("@")[0] ||
      "User";

		await ctx.db.insert("users", {
      authId: event.data.id,
      tokenIdentifier: event.data.id,
      name,
      email: event.data.email ?? "",
      pictureUrl: event.data.profilePictureUrl ?? undefined,
      createdAt: Date.now(),
    });

    // Auto-add new signups to the app's default organization (e.g. iamnimbus)
    // Requires WORKOS_ORG_ID to be set in Convex env
    await ctx.scheduler.runAfter(0, internal.authInternal.addUserToOrganization, {
      workosUserId: event.data.id,
    });
  },
  "user.updated": async (ctx, event) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", event.data.id))
      .unique();

    if (!user) {
      return;
    }

    const name =
      [event.data.firstName, event.data.lastName]
        .filter(Boolean)
        .join(" ") ||
      event.data.email?.split("@")[0] ||
      user.name;

    await ctx.db.patch(user._id, {
      email: event.data.email ?? user.email,
      name,
      pictureUrl: event.data.profilePictureUrl ?? user.pictureUrl,
      updatedAt: Date.now(),
    });
  },
	"user.deleted": async (ctx, event) => {
		const user = await ctx.db
			.query("users")
			.withIndex("by_authId", (q) => q.eq("authId", event.data.id))
			.unique();

		if (user) {
			await ctx.db.delete(user._id);
		}
	},
	// Roles follow the site's WorkOS organization membership. A deleted or
	// inactive membership clears the role, so a removed admin loses access as
	// soon as the event arrives. Memberships in other organizations are ignored.
	"organization_membership.created": async (ctx, event) => {
		await syncMembershipRole(ctx, event.data, false);
	},
	"organization_membership.updated": async (ctx, event) => {
		await syncMembershipRole(ctx, event.data, false);
	},
	"organization_membership.deleted": async (ctx, event) => {
		await syncMembershipRole(ctx, event.data, true);
	},
});

type MembershipData = {
	user_id?: string;
	userId?: string;
	organization_id?: string;
	organizationId?: string;
	status?: string;
	role?: { slug?: string };
	roles?: Array<{ slug?: string }>;
};

async function syncMembershipRole(ctx: MutationCtx, data: unknown, deleted: boolean) {
	const m = data as MembershipData;
	const userId = m.userId ?? m.user_id;
	if (!userId) return;
	const orgId = m.organizationId ?? m.organization_id;
	const siteOrg = process.env.WORKOS_ORG_ID;
	if (siteOrg && orgId && orgId !== siteOrg) return;

	const user = await ctx.db
		.query("users")
		.withIndex("by_authId", (q) => q.eq("authId", userId))
		.unique();
	if (!user) return;

	const active = !deleted && (m.status === undefined || m.status === "active");
	await ctx.db.patch(user._id, {
		role: active ? (m.role?.slug ?? m.roles?.[0]?.slug) : undefined,
		updatedAt: Date.now(),
	});
}
