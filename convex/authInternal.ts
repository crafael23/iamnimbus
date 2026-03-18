"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { authKit } from "./auth";

/**
 * Adds a newly created user to the default organization (e.g. "iamnimbus").
 * Called from the user.created webhook handler.
 * Requires WORKOS_ORG_ID to be set in Convex env.
 */
export const addUserToOrganization = internalAction({
	args: {
		workosUserId: v.string(),
	},
	handler: async (_ctx, args) => {
		const orgId = process.env.WORKOS_ORG_ID;
		if (!orgId) {
			console.warn(
				"[auth] WORKOS_ORG_ID not set – skipping org assignment. Set it in Convex to auto-add users to your org."
			);
			return;
		}

		try {
			await authKit.workos.userManagement.createOrganizationMembership({
				organizationId: orgId,
				userId: args.workosUserId,
				roleSlug: "member",
			});
		} catch (err) {
			// If user is already a member, WorkOS may return a conflict – log and continue
			const msg = err instanceof Error ? err.message : String(err);
			if (msg.includes("already") || msg.includes("exists")) {
				return; // Already a member, no-op
			}
			console.error("[auth] Failed to add user to organization:", err);
			throw err;
		}
	},
});
