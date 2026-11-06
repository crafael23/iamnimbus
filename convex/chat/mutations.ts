import { createThread, saveMessage } from "@convex-dev/agent";
import { ConvexError, v } from "convex/values";
import { components, internal } from "../_generated/api";
import { mutation } from "../_generated/server";
import { GUEST_NOTICE_AT, rateLimiter } from "../_lib/rateLimits";
import {
	authorizeThreadAccess,
	latestThreadId,
	limitFor,
	remainingMessages,
	resolveChatOwner,
} from "./threads";

const MAX_PROMPT_LENGTH = 2000;

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
		});
		return { tier: owner.tier, used, limit, remaining };
	},
});
