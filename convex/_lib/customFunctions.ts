import { customAction, customMutation, customQuery } from "convex-helpers/server/customFunctions";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { action, mutation, query } from "../_generated/server";
import { getCurrentUser, getCurrentUserOrNull, requireAdmin } from "./auth";

export const authedQuery = customQuery(query, {
	args: {},
	input: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		return { ctx: { ...ctx, user }, args };
	},
});

export const optionalAuthQuery = customQuery(query, {
	args: {},
	input: async (ctx, args) => {
		const user = await getCurrentUserOrNull(ctx);
		return { ctx: { ...ctx, user }, args };
	},
});

export const adminQuery = customQuery(query, {
	args: {},
	input: async (ctx, args) => {
		const user = await requireAdmin(ctx);
		return { ctx: { ...ctx, user }, args };
	},
});

export const authedMutation = customMutation(mutation, {
	args: {},
	input: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		return { ctx: { ...ctx, user }, args };
	},
});

export const adminMutation = customMutation(mutation, {
	args: {},
	input: async (ctx, args) => {
		const user = await requireAdmin(ctx);
		return { ctx: { ...ctx, user }, args };
	},
});

/**
 * Actions have no db access, so the admin check runs as an internal query.
 * The caller's identity carries through ctx.runQuery.
 */
export const adminAction = customAction(action, {
	args: {},
	input: async (ctx, args) => {
		const user: Doc<"users"> = await ctx.runQuery(internal.users.internal.requireAdminUser, {});
		return { ctx: { ...ctx, user }, args };
	},
});
