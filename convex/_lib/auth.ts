import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";

type Ctx = QueryCtx | MutationCtx;

export async function getCurrentUser(ctx: Ctx): Promise<Doc<"users">> {
	const identity = await ctx.auth.getUserIdentity();
	if (!identity) {
		throw new Error("Not authenticated");
	}

	// Convex tokenIdentifier is issuer|subject; we store WorkOS user id in authId (subject)
	const user = await ctx.db
		.query("users")
		.withIndex("by_authId", (q) => q.eq("authId", identity.subject))
		.unique();

	if (!user) {
		throw new Error("User not found");
	}

	return user;
}

export async function getCurrentUserOrNull(
	ctx: Ctx,
): Promise<Doc<"users"> | null> {
	const identity = await ctx.auth.getUserIdentity();
	if (!identity) {
		return null;
	}

	// Convex tokenIdentifier is issuer|subject; we store WorkOS user id in authId (subject)
	return await ctx.db
		.query("users")
		.withIndex("by_authId", (q) => q.eq("authId", identity.subject))
		.unique();
}

export async function requireAdmin(ctx: Ctx): Promise<Doc<"users">> {
	const user = await getCurrentUser(ctx);

	if (user.role !== "admin") {
		throw new Error("Admin access required");
	}

	return user;
}
