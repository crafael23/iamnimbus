"use node";

import { action, internalAction } from "../_generated/server";
import { v } from "convex/values";
import { supportAgent } from "./agent";

/**
 * Create a new thread and get an initial response.
 */
export const createThread = action({
	args: { prompt: v.string() },
	handler: async (ctx, { prompt }) => {
		const { threadId, thread } = await supportAgent.createThread(ctx);
		const result = await thread.generateText({ prompt });
		return { threadId, text: result.text };
	},
});

/**
 * Continue an existing thread with a new prompt.
 */
export const continueThread = action({
	args: { prompt: v.string(), threadId: v.string() },
	handler: async (ctx, { prompt, threadId }) => {
		const { thread } = await supportAgent.continueThread(ctx, { threadId });
		const result = await thread.generateText({ prompt });
		return result.text;
	},
});

/**
 * Internal action to generate AI response asynchronously with streaming.
 * Saves deltas to the database so clients can subscribe via listThreadMessages.
 */
export const generateResponseAsync = internalAction({
	args: {
		threadId: v.string(),
		promptMessageId: v.string(),
	},
	handler: async (ctx, { threadId, promptMessageId }) => {
		const result = await supportAgent.streamText(
			ctx,
			{ threadId },
			{ promptMessageId },
			{ saveStreamDeltas: { chunking: "word", throttleMs: 100 } }
		);
		await result.consumeStream();
	},
});
