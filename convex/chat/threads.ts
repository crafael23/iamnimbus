import { getThreadMetadata } from "@convex-dev/agent";
import { calculateRateLimit } from "@convex-dev/rate-limiter";
import { ConvexError } from "convex/values";
import { components } from "../_generated/api";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Tier } from "../_lib/persona";
import {
	GUEST_MESSAGE_LIMIT,
	REGISTERED_MESSAGE_LIMIT,
	rateLimiter,
} from "../_lib/rateLimits";

type Ctx = QueryCtx | MutationCtx;

/**
 * Who is chatting. Decided only from server state: an authenticated identity
 * makes the caller "registered"; otherwise the caller must present a guest
 * session id (a random UUID the browser keeps in localStorage).
 *
 * `ownerId` is stored as the agent thread's userId and is the ownership check
 * for every read and write. It is also the rate-limit key.
 */
export type ChatOwner = { tier: Tier; ownerId: string };

const GUEST_SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function resolveChatOwner(
	ctx: Ctx,
	guestSessionId: string | undefined,
): Promise<ChatOwner> {
	const identity = await ctx.auth.getUserIdentity();
	if (identity) {
		return { tier: "registered", ownerId: `user:${identity.subject}` };
	}
	if (!guestSessionId || !GUEST_SESSION_ID.test(guestSessionId)) {
		throw new ConvexError({ code: "NO_SESSION" });
	}
	return { tier: "guest", ownerId: `guest:${guestSessionId.toLowerCase()}` };
}

/** Throws FORBIDDEN unless the thread exists and belongs to `owner`. */
export async function authorizeThreadAccess(
	ctx: Ctx,
	threadId: string,
	owner: ChatOwner,
): Promise<void> {
	let threadOwner: string | undefined;
	try {
		threadOwner = (await getThreadMetadata(ctx, components.agent, { threadId }))
			.userId;
	} catch {
		threadOwner = undefined;
	}
	if (!threadOwner || threadOwner !== owner.ownerId) {
		throw new ConvexError({ code: "FORBIDDEN" });
	}
}

export async function latestThreadId(
	ctx: Ctx,
	ownerId: string,
): Promise<string | null> {
	const { page } = await ctx.runQuery(
		components.agent.threads.listThreadsByUserId,
		{ userId: ownerId, order: "desc", paginationOpts: { numItems: 1, cursor: null } },
	);
	return page[0]?._id ?? null;
}

export function limitFor(tier: Tier) {
	return tier === "guest" ? GUEST_MESSAGE_LIMIT : REGISTERED_MESSAGE_LIMIT;
}

/** Messages left for this owner right now (whole tokens in their bucket). */
export async function remainingMessages(ctx: Ctx, owner: ChatOwner) {
	const name = owner.tier === "guest" ? "guestMessages" : "registeredMessages";
	const { value, ts, config } = await rateLimiter.getValue(ctx, name, {
		key: owner.ownerId,
	});
	const current = calculateRateLimit({ value, ts }, config, Date.now(), 0);
	return Math.max(0, Math.min(limitFor(owner.tier), Math.floor(current.value)));
}
