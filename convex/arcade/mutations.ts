import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import { mutation } from "../_generated/server";
import { MAX_INPUTS } from "../_lib/arcade/engine";
import { normalizeInitials } from "../_lib/arcade/initials";
import { OPEN_RUN_TTL_MS } from "../_lib/arcade/leaderboard";
import { rateLimiter } from "../_lib/rateLimits";
import { resolveChatOwner } from "../chat/threads";

export const startRun = mutation({
	args: {
		guestToken: v.optional(v.string()),
		layout: v.union(v.literal("wide"), v.literal("tall")),
	},
	returns: v.object({ runId: v.id("arcadeRuns"), seed: v.number() }),
	handler: async (ctx, { guestToken, layout }) => {
		const owner = await resolveChatOwner(ctx, guestToken, "write");
		const limit = await rateLimiter.limit(ctx, "arcadeRuns", { key: owner.ownerId });
		if (!limit.ok) throw new ConvexError({ code: "RATE_LIMITED" });
		if (owner.network) {
			const networkLimit = await rateLimiter.limit(ctx, "arcadeRunsNetwork", { key: owner.network });
			if (!networkLimit.ok) throw new ConvexError({ code: "RATE_LIMITED" });
		}
		const open = await ctx.db
			.query("arcadeRuns")
			.withIndex("by_owner_status", (q) => q.eq("ownerId", owner.ownerId).eq("status", "open"))
			.collect();
		for (const run of open) await ctx.db.delete("arcadeRuns", run._id);
		const seed = Math.floor(Math.random() * 0x100000000) | 0;
		const runId = await ctx.db.insert("arcadeRuns", {
			ownerId: owner.ownerId,
			network: owner.network,
			seed,
			layout,
			startedAt: Date.now(),
			status: "open",
		});
		return { runId, seed };
	},
});

export const submitRun = mutation({
	args: {
		runId: v.id("arcadeRuns"),
		inputs: v.bytes(),
		initials: v.string(),
		guestToken: v.optional(v.string()),
	},
	returns: v.null(),
	handler: async (ctx, { runId, inputs, initials: inputInitials, guestToken }) => {
		const owner = await resolveChatOwner(ctx, guestToken, "write");
		const run = await ctx.db.get("arcadeRuns", runId);
		if (!run || run.ownerId !== owner.ownerId) throw new ConvexError({ code: "FORBIDDEN" });
		if (run.status !== "open") throw new ConvexError({ code: "BAD_RUN" });
		// Past its lifetime the run is cleanup's to delete; accepting it could race that.
		if (Date.now() - run.startedAt > OPEN_RUN_TTL_MS) throw new ConvexError({ code: "BAD_RUN" });
		if (inputs.byteLength % 4 !== 0 || inputs.byteLength > MAX_INPUTS * 4) {
			throw new ConvexError({ code: "BAD_RUN" });
		}
		const initials = normalizeInitials(inputInitials);
		if (!initials) throw new ConvexError({ code: "BAD_INITIALS" });
		await ctx.db.patch("arcadeRuns", runId, { status: "verifying", inputs, initials, submittedAt: Date.now() });
		await ctx.scheduler.runAfter(0, internal.arcade.internal.verifyRun, { runId });
		return null;
	},
});
