import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
	users: defineTable({
		authId: v.optional(v.string()), // WorkOS user id, from webhook event.data.id
		tokenIdentifier: v.string(), // Convex auth lookup, same as authId for WorkOS
		name: v.string(),
		email: v.string(),
		pictureUrl: v.optional(v.string()),
		role: v.optional(v.string()), // WorkOS org membership role slug (member, admin, etc.)
		createdAt: v.number(),
		updatedAt: v.optional(v.number()),
	})
		.index("by_token", ["tokenIdentifier"])
		.index("by_authId", ["authId"])
		.index("by_email", ["email"]),
});

