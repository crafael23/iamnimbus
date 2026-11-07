import { v } from "convex/values";
import { query } from "../_generated/server";
import { arcadeScores, rankOf } from "../_lib/arcade/leaderboard";
import { resolveChatOwner } from "../chat/threads";

export const leaderboard = query({
	args: { guestToken: v.optional(v.string()) },
	returns: v.object({
		top: v.array(v.object({ initials: v.string(), score: v.number(), level: v.number(), mine: v.boolean() })),
		total: v.number(),
	}),
	handler: async (ctx, { guestToken }) => {
		let ownerId: string | undefined;
		try {
			ownerId = (await resolveChatOwner(ctx, guestToken, "read")).ownerId;
		} catch {
			/* Public scores still load without a session. */
		}
		const top = await ctx.db.query("arcadeScores").withIndex("by_score").order("desc").take(10);
		return {
			top: top.map(({ initials, score, level, ownerId: rowOwner }) => ({
				initials,
				score,
				level,
				mine: rowOwner === ownerId,
			})),
			total: await arcadeScores.count(ctx),
		};
	},
});

export const runStatus = query({
	args: { runId: v.id("arcadeRuns"), guestToken: v.optional(v.string()) },
	returns: v.union(
		v.null(),
		v.object({
			status: v.union(v.literal("open"), v.literal("verifying"), v.literal("verified"), v.literal("rejected")),
			score: v.optional(v.number()),
			level: v.optional(v.number()),
			rank: v.optional(v.number()),
			total: v.optional(v.number()),
			personalBest: v.optional(v.boolean()),
			reason: v.optional(v.string()),
		}),
	),
	handler: async (ctx, { runId, guestToken }) => {
		let ownerId: string;
		try {
			ownerId = (await resolveChatOwner(ctx, guestToken, "read")).ownerId;
		} catch {
			return null;
		}
		const run = await ctx.db.get("arcadeRuns", runId);
		if (!run || run.ownerId !== ownerId) return null;
		const { status, score, level, rank, total, personalBest, reason } = run;
		return { status, score, level, rank, total, personalBest, reason };
	},
});

export const myBest = query({
	args: { guestToken: v.optional(v.string()) },
	returns: v.union(
		v.null(),
		v.object({ initials: v.string(), score: v.number(), level: v.number(), rank: v.number() }),
	),
	handler: async (ctx, { guestToken }) => {
		let ownerId: string;
		try {
			ownerId = (await resolveChatOwner(ctx, guestToken, "read")).ownerId;
		} catch {
			return null;
		}
		const best = await ctx.db
			.query("arcadeScores")
			.withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
			.unique();
		if (!best) return null;
		return { initials: best.initials, score: best.score, level: best.level, rank: await rankOf(ctx, best.score) };
	},
});
