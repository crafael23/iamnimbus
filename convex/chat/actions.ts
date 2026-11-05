import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { buildSystemPrompt } from "../_lib/persona";
import { agents } from "./agent";

/**
 * Stream the reply for a saved prompt. Deltas are written to the database so
 * every subscribed client (and a refreshed tab) sees the same stream.
 * Internal only: tier and counts were decided in chat.mutations.sendMessage.
 */
export const generateResponse = internalAction({
	args: {
		threadId: v.string(),
		promptMessageId: v.string(),
		tier: v.union(v.literal("guest"), v.literal("registered")),
		used: v.number(),
		limit: v.number(),
		noticeAt: v.number(),
		prompt: v.string(),
	},
	handler: async (ctx, args) => {
		const persona = await ctx.runQuery(
			internal.prompts.queries.activeContent,
			{},
		);
		const system = buildSystemPrompt({ ...args, persona });
		const result = await agents[args.tier].streamText(
			ctx,
			{ threadId: args.threadId },
			{ promptMessageId: args.promptMessageId, system },
			{ saveStreamDeltas: { chunking: "word", throttleMs: 80 } },
		);
		await result.consumeStream();
	},
});
