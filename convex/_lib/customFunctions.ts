import {
	customMutation,
	customQuery,
} from "convex-helpers/server/customFunctions";
import { mutation, query } from "../_generated/server";
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
