import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { recordSpend } from "../_lib/billing";

/** Add one call's cost to this month's and today's spend. */
export const record = internalMutation({
	args: { costUsd: v.number() },
	returns: v.null(),
	handler: async (ctx, { costUsd }) => {
		await recordSpend(ctx, costUsd);
		return null;
	},
});
