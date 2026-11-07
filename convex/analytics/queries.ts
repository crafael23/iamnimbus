import { v } from "convex/values";
import { adminQuery } from "../_lib/customFunctions";
import { spendStatus } from "../_lib/billing";
import { utcDay, topics, vTopic } from "../_lib/analytics";
const counts = v.object({ guest: v.number(), registered: v.number() });
export const summary = adminQuery({
	args: { days: v.union(v.literal(7), v.literal(30)) },
	returns: v.object({
		sessions: counts,
		messages: counts,
		reachedLimit: v.number(),
		conversions: v.number(),
		atGate: v.number(),
		topics: v.array(v.object({ topic: vTopic, count: v.number() })),
		monthSpend: v.number(),
		monthBudget: v.number(),
	}),
	handler: async (ctx, { days }) => {
		const start = utcDay(Date.now() - (days - 1) * 86400000);
		// Fail explicitly if this lightweight report outgrows a single Convex read, never silently truncate.
		const events = await ctx.db
			.query("analyticsEvents")
			.withIndex("by_day_kind", (q) => q.gte("day", start).lte("day", utcDay()))
			.take(15000);
		if (events.length === 15000) throw new Error("Analytics report exceeds its read limit");
		const result = {
			sessions: { guest: 0, registered: 0 },
			messages: { guest: 0, registered: 0 },
			reachedLimit: 0,
			conversions: 0,
			atGate: 0,
			topics: topics.map((topic) => ({ topic, count: 0 })),
			monthSpend: 0,
			monthBudget: 0,
		};
		const byTopic = new Map(result.topics.map((row) => [row.topic, row]));
		for (const event of events) {
			if (event.kind === "session" && event.tier) result.sessions[event.tier]++;
			if (event.kind === "message" && event.tier) result.messages[event.tier]++;
			if (event.kind === "limit") result.reachedLimit++;
			if (event.kind === "conversion") {
				result.conversions++;
				if (event.atGate) result.atGate++;
			}
			if (event.kind === "topic") {
				const row = event.topic ? byTopic.get(event.topic) : undefined;
				if (row) row.count++;
			}
		}
		const spend = await spendStatus(ctx);
		result.monthSpend = spend.month;
		result.monthBudget = spend.limits.month;
		return result;
	},
});
