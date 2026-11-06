import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { recordEvent, utcDay, vTopic } from "../_lib/analytics";
export const recordTopic = internalMutation({
	args: { topic: vTopic },
	returns: v.null(),
	handler: async (ctx, { topic }) => {
		await recordEvent(ctx, { kind: "topic", topic });
		return null;
	},
});
export const prune = internalMutation({
	args: {},
	returns: v.null(),
	handler: async (ctx) => {
		const cutoff = utcDay(Date.now() - 180 * 86400000);
		const rows = await ctx.db
			.query("analyticsEvents")
			.withIndex("by_day_kind", (q) => q.lt("day", cutoff))
			.take(250);
		for (const row of rows) await ctx.db.delete(row._id);
		if (rows.length === 250) await ctx.scheduler.runAfter(0, internal.analytics.internal.prune, {});
		return null;
	},
});
