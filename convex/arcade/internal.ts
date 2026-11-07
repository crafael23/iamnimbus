import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import { replay, TICK_HZ } from "../_lib/arcade/engine";
import {
	arcadeScores,
	FINISHED_RUN_TTL_MS,
	OPEN_RUN_TTL_MS,
	rankOf,
	VERIFYING_TTL_MS,
} from "../_lib/arcade/leaderboard";

export const loadRun = internalQuery({
	args: { runId: v.id("arcadeRuns") },
	returns: v.union(
		v.null(),
		v.object({
			seed: v.number(),
			layout: v.union(v.literal("wide"), v.literal("tall")),
			startedAt: v.number(),
			submittedAt: v.number(),
			inputs: v.bytes(),
		}),
	),
	handler: async (ctx, { runId }) => {
		const run = await ctx.db.get("arcadeRuns", runId);
		if (!run || run.status !== "verifying" || !run.inputs || run.submittedAt === undefined) return null;
		return {
			seed: run.seed,
			layout: run.layout,
			startedAt: run.startedAt,
			submittedAt: run.submittedAt,
			inputs: run.inputs,
		};
	},
});

export const verifyRun = internalAction({
	args: { runId: v.id("arcadeRuns") },
	returns: v.null(),
	handler: async (ctx, { runId }) => {
		const run = await ctx.runQuery(internal.arcade.internal.loadRun, { runId });
		if (!run) return null;
		// DataView makes the wire format little-endian on every host.
		const view = new DataView(run.inputs);
		const inputs = Array.from({ length: view.byteLength / 4 }, (_, i) => view.getUint32(i * 4, true));
		const result = replay(run.seed, run.layout, inputs);
		const tooFast = result.ok && run.submittedAt - run.startedAt < ((result.ticks * 1000) / TICK_HZ) * 0.95;
		await ctx.runMutation(internal.arcade.internal.recordResult, {
			runId,
			result: tooFast ? { ok: false, reason: "too-fast" } : result,
		});
		return null;
	},
});

export const recordResult = internalMutation({
	args: {
		runId: v.id("arcadeRuns"),
		result: v.union(
			v.object({ ok: v.literal(true), score: v.number(), level: v.number(), ticks: v.number() }),
			v.object({ ok: v.literal(false), reason: v.string() }),
		),
	},
	returns: v.null(),
	handler: async (ctx, { runId, result }) => {
		const run = await ctx.db.get("arcadeRuns", runId);
		if (!run || run.status !== "verifying") return null;
		if (!result.ok) {
			await ctx.db.patch("arcadeRuns", runId, { status: "rejected", reason: result.reason, inputs: undefined });
			return null;
		}
		let personalBest = false;
		if (result.score > 0) {
			const previous = await ctx.db
				.query("arcadeScores")
				.withIndex("by_owner", (q) => q.eq("ownerId", run.ownerId))
				.unique();
			if (!previous || result.score > previous.score) {
				const best = {
					ownerId: run.ownerId,
					initials: run.initials!,
					score: result.score,
					level: result.level,
					achievedAt: run.submittedAt!,
				};
				if (previous) {
					await ctx.db.patch("arcadeScores", previous._id, best);
					await arcadeScores.replace(ctx, previous, { ...previous, ...best });
				} else {
					const id = await ctx.db.insert("arcadeScores", best);
					await arcadeScores.insert(ctx, (await ctx.db.get("arcadeScores", id))!);
				}
				personalBest = true;
			}
		}
		await ctx.db.patch("arcadeRuns", runId, {
			status: "verified",
			inputs: undefined,
			score: result.score,
			level: result.level,
			ticks: result.ticks,
			rank: await rankOf(ctx, result.score),
			total: await arcadeScores.count(ctx),
			personalBest,
		});
		return null;
	},
});

const CLEANUP_BATCH = 100;

/**
 * Delete expired runs in bounded, index-only batches; a full batch schedules
 * another pass, so a backlog drains without any one mutation reading much.
 */
export const cleanupRuns = internalMutation({
	args: {},
	returns: v.null(),
	handler: async (ctx) => {
		const now = Date.now();
		const batches = [
			await ctx.db
				.query("arcadeRuns")
				.withIndex("by_status_startedAt", (q) => q.eq("status", "open").lt("startedAt", now - OPEN_RUN_TTL_MS))
				.take(CLEANUP_BATCH),
			// Verification is timed from submission, so a long-paused run submitted in time is never cut off.
			await ctx.db
				.query("arcadeRuns")
				.withIndex("by_status_submittedAt", (q) =>
					q.eq("status", "verifying").lt("submittedAt", now - VERIFYING_TTL_MS),
				)
				.take(CLEANUP_BATCH),
			...(await Promise.all(
				(["verified", "rejected"] as const).map((status) =>
					ctx.db
						.query("arcadeRuns")
						.withIndex("by_status_startedAt", (q) => q.eq("status", status).lt("startedAt", now - FINISHED_RUN_TTL_MS))
						.take(CLEANUP_BATCH),
				),
			)),
		];
		for (const batch of batches) for (const run of batch) await ctx.db.delete("arcadeRuns", run._id);
		if (batches.some((b) => b.length === CLEANUP_BATCH)) {
			await ctx.scheduler.runAfter(0, internal.arcade.internal.cleanupRuns, {});
		}
		return null;
	},
});
