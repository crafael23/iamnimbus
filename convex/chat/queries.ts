import { listUIMessages, syncStreams, vStreamArgs } from "@convex-dev/agent";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { components } from "../_generated/api";
import { query } from "../_generated/server";
import { GUEST_NOTICE_AT } from "../_lib/rateLimits";
import {
	authorizeThreadAccess,
	limitFor,
	remainingMessages,
	resolveChatOwner,
} from "./threads";

/**
 * Messages with live stream deltas, for the owner of the thread only.
 * Use with useUIMessages(api.chat.queries.listThreadMessages, {...}, { stream: true }).
 */
export const listThreadMessages = query({
	args: {
		threadId: v.string(),
		guestToken: v.optional(v.string()),
		paginationOpts: paginationOptsValidator,
		streamArgs: vStreamArgs,
	},
	handler: async (ctx, { threadId, guestToken, paginationOpts, streamArgs }) => {
		const owner = await resolveChatOwner(ctx, guestToken, "read");
		await authorizeThreadAccess(ctx, threadId, owner);
		const [streams, paginated] = await Promise.all([
			syncStreams(ctx, components.agent, { threadId, streamArgs }),
			listUIMessages(ctx, components.agent, { threadId, paginationOpts }),
		]);
		return { ...paginated, streams };
	},
});

/** Tier and quota for the current visitor, computed on the server. */
export const session = query({
	args: { guestToken: v.optional(v.string()) },
	handler: async (ctx, { guestToken }) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity && !guestToken) return null;
		const owner = await resolveChatOwner(ctx, guestToken, "read");
		const limit = limitFor(owner.tier);
		const remaining = await remainingMessages(ctx, owner);
		return {
			tier: owner.tier,
			limit,
			remaining,
			used: limit - remaining,
			noticeAt: owner.tier === "guest" ? GUEST_NOTICE_AT : null,
		};
	},
});
