import { createThread, saveMessage } from "@convex-dev/agent";
import { ConvexError, v } from "convex/values";
import { components, internal } from "../_generated/api";
import { mutation } from "../_generated/server";
import { recordEvent } from "../_lib/analytics";
import { reserveTurn } from "../_lib/billing";
import { GUEST_NOTICE_AT, rateLimiter } from "../_lib/rateLimits";
import {
	authorizeThreadAccess,
	latestThreadId,
	limitFor,
	remainingMessages,
	resolveChatOwner,
} from "./threads";

const MAX_PROMPT_LENGTH = 2000;
/** How long an unanswered message blocks its thread (a crashed turn unblocks after this). */
const TURN_LOCK_MS = 2 * 60 * 1000;
const ABANDONED_PROMPT = "[not sent: the safety check did not finish]";

/**
 * Registered users resume their latest thread (it persists across visits).
 * Guests get a fresh thread unless `resume` names one they already own.
 */
export const startThread = mutation({
	args: {
		guestToken: v.optional(v.string()),
		resume: v.optional(v.string()),
	},
	handler: async (ctx, { guestToken, resume }) => {
		const owner = await resolveChatOwner(ctx, guestToken, "write");
		if (owner.tier === "registered") {
			const existing = await latestThreadId(ctx, owner.ownerId);
			if (existing) return { threadId: existing };
		} else if (resume) {
			try {
				await authorizeThreadAccess(ctx, resume, owner);
				return { threadId: resume };
			} catch {
				// Not theirs or gone: fall through to a new thread.
			}
		}
		const status = await rateLimiter.limit(ctx, "threadCreate", {
			key: owner.ownerId,
		});
		if (!status.ok) throw new ConvexError({ code: "RATE_LIMITED" });
		if (owner.network) {
			// Throwing rolls back the per-owner token taken above.
			const net = await rateLimiter.limit(ctx, "guestNetworkThreads", {
				key: owner.network,
			});
			if (!net.ok) throw new ConvexError({ code: "RATE_LIMITED" });
		}
		const threadId = await createThread(ctx, components.agent, {
			userId: owner.ownerId,
		});
		await recordEvent(ctx, { kind: "session", tier: owner.tier });
		return { threadId };
	},
});

/**
 * Save the visitor's message and schedule the streamed reply. The tier, model
 * and limits come from server-side auth state; the client sends only text.
 */
export const sendMessage = mutation({
	args: {
		threadId: v.string(),
		prompt: v.string(),
		guestToken: v.optional(v.string()),
	},
	handler: async (ctx, { threadId, prompt, guestToken }) => {
		const text = prompt.trim();
		if (!text) throw new ConvexError({ code: "EMPTY" });
		if (text.length > MAX_PROMPT_LENGTH) {
			throw new ConvexError({ code: "TOO_LONG", max: MAX_PROMPT_LENGTH });
		}
		const owner = await resolveChatOwner(ctx, guestToken, "write");
		await authorizeThreadAccess(ctx, threadId, owner);
		// One turn at a time per thread: a message that has not been judged yet
		// must never be loaded as history by a concurrent turn.
		const { page: latest } = await ctx.runQuery(
			components.agent.messages.listMessagesByThreadId,
			{ threadId, order: "desc", paginationOpts: { numItems: 1, cursor: null } },
		);
		const last = latest[0];
		if (last?.message?.role === "user") {
			if (Date.now() - last._creationTime < TURN_LOCK_MS) {
				throw new ConvexError({ code: "BUSY" });
			}
			// An abandoned turn: its prompt was never judged. Fence it out of
			// history before this turn can load it as context.
			await ctx.runMutation(components.agent.messages.updateMessage, {
				messageId: last._id,
				patch: { message: { role: "user", content: ABANDONED_PROMPT } },
			});
		}
		// Hold this turn's worst-case cost; throws BUDGET if it would not fit.
		// Any later throw rolls the hold back with everything else.
		const reservationId = await reserveTurn(ctx, owner.tier);

		const limitName =
			owner.tier === "guest" ? "guestMessages" : "registeredMessages";
		const status = await rateLimiter.limit(ctx, limitName, {
			key: owner.ownerId,
		});
		if (!status.ok) {
			throw new ConvexError({
				code: owner.tier === "guest" ? "GUEST_LIMIT" : "DAILY_LIMIT",
				retryAfter: status.retryAfter,
			});
		}
		if (owner.tier === "registered") {
			// Throwing rolls back the per-user token taken above.
			const shared = await rateLimiter.limit(ctx, "registeredGlobal");
			if (!shared.ok) {
				throw new ConvexError({ code: "CAPACITY", retryAfter: shared.retryAfter });
			}
		}
		if (owner.network) {
			// Throwing rolls back every token taken above, so a rejected
			// message never spends the guest's own allowance.
			const net = await rateLimiter.limit(ctx, "guestNetworkMessages", {
				key: owner.network,
			});
			if (!net.ok) {
				throw new ConvexError({
					code: "NETWORK_LIMIT",
					retryAfter: net.retryAfter,
				});
			}
			const global = await rateLimiter.limit(ctx, "guestGlobal");
			if (!global.ok) {
				throw new ConvexError({
					code: "CAPACITY",
					retryAfter: global.retryAfter,
				});
			}
		}

		const limit = limitFor(owner.tier);
		const remaining = await remainingMessages(ctx, owner);
		const used = limit - remaining;

		const { messageId } = await saveMessage(ctx, components.agent, {
			threadId,
			userId: owner.ownerId,
			prompt: text,
		});
		await ctx.scheduler.runAfter(0, internal.chat.actions.generateResponse, {
			threadId,
			promptMessageId: messageId,
			tier: owner.tier,
			used,
			limit,
			noticeAt: GUEST_NOTICE_AT,
			prompt: text,
			reservationId,
		});
		await recordEvent(ctx, { kind: "message", tier: owner.tier });
		if (owner.tier === "guest" && remaining === 0) {
			await recordEvent(ctx, { kind: "limit", tier: "guest" });
		}
		return { tier: owner.tier, used, limit, remaining };
	},
});
