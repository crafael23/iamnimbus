import { createThread, saveMessage } from "@convex-dev/agent";
import { mutation } from "../_generated/server";
import { components, internal } from "../_generated/api";
import { v } from "convex/values";

/**
 * Create an empty thread for streaming chat.
 * Returns threadId to pass to sendMessage and listThreadMessages.
 */
export const createThreadMutation = mutation({
	args: {},
	handler: async (ctx) => {
		const threadId = await createThread(ctx, components.agent);
		return { threadId };
	},
});

/**
 * Save a user message and trigger async streaming response.
 * Clients subscribe via listThreadMessages with stream: true.
 */
export const sendMessage = mutation({
	args: { threadId: v.string(), prompt: v.string() },
	handler: async (ctx, { threadId, prompt }) => {
		const { messageId } = await saveMessage(ctx, components.agent, {
			threadId,
			prompt,
		});
		await ctx.scheduler.runAfter(
			0,
			internal.chat.actions.generateResponseAsync,
			{
				threadId,
				promptMessageId: messageId,
			}
		);
	},
});
