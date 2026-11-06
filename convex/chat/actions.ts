import { saveMessage } from "@convex-dev/agent";
import { v } from "convex/values";
import { components, internal } from "../_generated/api";
import { type ActionCtx, internalAction } from "../_generated/server";
import { buildSystemPrompt } from "../_lib/persona";
import { checkContent } from "../_lib/safety";
import { agents } from "./agent";

const REFUSED_PROMPT =
	"That reads like an attempt to change how this terminal works, so it was not run. Ask about projects, writing or work instead.";
const WITHHELD_REPLY = "This reply was withheld by a safety check. Try asking another way.";
const JUDGE_DOWN =
	"The safety check is not answering right now, so nothing was sent. Try again in a minute.";
const MODEL_FAILED = "Transmission lost. Send the message again.";

/** Shown in the thread in place of a message that never reached the model. */
const WITHHELD_PROMPT = "[withheld by the safety check]";
const UNCHECKED_PROMPT = "[not sent: the safety check was unavailable]";

/**
 * Answer a saved prompt behind two Jev gates (convex/_lib/safety.ts):
 *
 * 1. The visitor's message is judged before the agent sees it. A flagged
 *    message is replaced in the thread, so it never enters later context.
 * 2. The agent's reply is generated without being saved, judged, and only
 *    then written to the thread. Nothing reaches the visitor unchecked.
 *
 * Every model and judge call counts against the AI budget. Internal only:
 * tier and counts were decided in chat.mutations.sendMessage.
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
	returns: v.null(),
	handler: async (ctx, args) => {
		const agent = agents[args.tier];
		const reply = (text: string) =>
			saveMessage(ctx, components.agent, {
				threadId: args.threadId,
				promptMessageId: args.promptMessageId,
				agentName: agent.options.name,
				message: { role: "assistant", content: text },
			});

		const inbound = await checkContent("visitor", { message: args.prompt });
		await recordCost(ctx, inbound.cost);
		if (inbound.flagged) {
			await replacePrompt(ctx, args.promptMessageId, inbound.error ? UNCHECKED_PROMPT : WITHHELD_PROMPT);
			await reply(inbound.error ? JUDGE_DOWN : REFUSED_PROMPT);
			return null;
		}

		let text: string;
		try {
			const persona = await ctx.runQuery(internal.prompts.queries.activeContent, {});
			const system = buildSystemPrompt({ ...args, persona });
			const result = await agent.generateText(
				ctx,
				{ threadId: args.threadId },
				{ promptMessageId: args.promptMessageId, system },
				// Held back until the reply gate passes; saved below.
				{ storageOptions: { saveMessages: "none" } },
			);
			text = result.text.trim();
		} catch (error) {
			console.error("generateResponse failed", error);
			await reply(MODEL_FAILED);
			return null;
		}

		const outbound = await checkContent("reply", { visitorMessage: args.prompt, reply: text });
		await recordCost(ctx, outbound.cost);
		if (outbound.flagged) {
			await reply(outbound.error ? JUDGE_DOWN : WITHHELD_REPLY);
			return null;
		}
		await reply(text || MODEL_FAILED);
		return null;
	},
});

async function recordCost(ctx: ActionCtx, costUsd: number) {
	if (costUsd > 0) await ctx.runMutation(internal.billing.internal.record, { costUsd });
}

async function replacePrompt(ctx: ActionCtx, messageId: string, content: string) {
	await ctx.runMutation(components.agent.messages.updateMessage, {
		// The agent component's own message id, passed through as a string.
		messageId: messageId as never,
		patch: { message: { role: "user", content } },
	});
}
