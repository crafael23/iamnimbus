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
const TURN_FAILED = "Transmission lost. Send the message again.";

/** Shown in the thread in place of a message that never reached the model. */
const WITHHELD_PROMPT = "[withheld by the safety check]";
const UNCHECKED_PROMPT = "[not sent: the safety check was unavailable]";

/**
 * Answer a saved prompt behind two Jev gates (convex/_lib/safety.ts):
 *
 * 1. The visitor's message is judged before the agent sees it. A message that
 *    is flagged, or could not be judged, is replaced in the thread so it
 *    never enters later context. (sendMessage allows one turn at a time per
 *    thread, so no other turn can load it before then.)
 * 2. The agent's reply is generated without being saved, judged, and only
 *    then written to the thread. Nothing reaches the visitor unchecked.
 *
 * Every turn ends with a saved assistant message, whatever fails, so the
 * thread never hangs. Model and judge costs are recorded as they happen; the
 * turn's budget hold is released at the end, or booked as spent if a cost
 * could not be recorded.
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
		reservationId: v.id("aiReservations"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const agent = agents[args.tier];
		const turn = { approved: false, replied: false, unrecorded: false };
		const reply = async (text: string) => {
			await saveMessage(ctx, components.agent, {
				threadId: args.threadId,
				promptMessageId: args.promptMessageId,
				agentName: agent.options.name,
				message: { role: "assistant", content: text },
			});
			turn.replied = true;
		};
		const charge = async (costUsd: number) => {
			if (!(costUsd > 0)) return;
			try {
				await ctx.runMutation(internal.billing.internal.record, { costUsd });
			} catch (error) {
				console.error("could not record AI cost", error);
				turn.unrecorded = true;
			}
		};

		try {
			const inbound = await checkContent("visitor", { message: args.prompt });
			await charge(inbound.cost);
			if (inbound.flagged) {
				await replacePrompt(ctx, args.promptMessageId, inbound.error ? UNCHECKED_PROMPT : WITHHELD_PROMPT);
				turn.approved = true; // replaced, so it is safe in history
				await reply(inbound.error ? JUDGE_DOWN : REFUSED_PROMPT);
				return null;
			}
			turn.approved = true;

			const persona = await ctx.runQuery(internal.prompts.queries.activeContent, {});
			const system = buildSystemPrompt({ ...args, persona });
			const result = await agent.generateText(
				ctx,
				{ threadId: args.threadId },
				{ promptMessageId: args.promptMessageId, system },
				// Held back until the reply gate passes; saved below.
				{ storageOptions: { saveMessages: "none" } },
			);
			const text = result.text.trim();

			const outbound = await checkContent("reply", { visitorMessage: args.prompt, reply: text });
			await charge(outbound.cost);
			if (outbound.flagged) {
				await reply(outbound.error ? JUDGE_DOWN : WITHHELD_REPLY);
				return null;
			}
			await reply(text || TURN_FAILED);
		} catch (error) {
			console.error("generateResponse failed", error);
			// A model call may have run without its cost being recorded (the
			// agent's usageHandler throws through generateText): book the hold.
			if (turn.approved) turn.unrecorded = true;
			if (!turn.approved) {
				await replacePrompt(ctx, args.promptMessageId, UNCHECKED_PROMPT).catch((e: unknown) =>
					console.error("could not withhold unchecked prompt", e),
				);
			}
			if (!turn.replied) {
				await reply(TURN_FAILED).catch((e: unknown) => console.error("could not save failure reply", e));
			}
		} finally {
			// If this fails too, the hold simply expires (RESERVATION_TTL_MS).
			await ctx
				.runMutation(internal.billing.internal.release, {
					reservationId: args.reservationId,
					charge: turn.unrecorded,
				})
				.catch((e: unknown) => console.error("could not release budget hold", e));
		}
		return null;
	},
});

async function replacePrompt(ctx: ActionCtx, messageId: string, content: string) {
	await ctx.runMutation(components.agent.messages.updateMessage, {
		// The agent component's own message id, passed through as a string.
		messageId: messageId as never,
		patch: { message: { role: "user", content } },
	});
}
