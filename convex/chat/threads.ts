import { getThreadMetadata } from "@convex-dev/agent";
import { calculateRateLimit } from "@convex-dev/rate-limiter";
import { ConvexError } from "convex/values";
import { components } from "../_generated/api";
import { env, type MutationCtx, type QueryCtx } from "../_generated/server";
import { readGuestAccess } from "../_lib/guestToken";
import type { Tier } from "../_lib/persona";
import { GUEST_MESSAGE_LIMIT, REGISTERED_MESSAGE_LIMIT, rateLimiter } from "../_lib/rateLimits";

type Ctx = QueryCtx | MutationCtx;

/**
 * Who is chatting. Decided only from server state: an authenticated identity
 * makes the caller "registered"; otherwise the caller must present a guest
 * access token signed by the Next route at /api/guest (see _lib/guestToken).
 *
 * `ownerId` is stored as the agent thread's userId and is the ownership check
 * for every read and write. It is also the per-guest rate-limit key, and
 * `network` (guests only) keys the per-network limits.
 */
export type ChatOwner = { tier: Tier; ownerId: string; network?: string };

/** How long a read may keep using an expired access token (the cookie's life). */
const READ_GRACE_MS = 30 * 24 * 60 * 60 * 1000;

export async function resolveChatOwner(
	ctx: Ctx,
	guestToken: string | undefined,
	use: "read" | "write",
): Promise<ChatOwner> {
	const identity = await ctx.auth.getUserIdentity();
	if (identity) {
		return { tier: "registered", ownerId: `user:${identity.subject}` };
	}
	const secret = env.GUEST_TOKEN_SECRET;
	if (!secret) throw new Error("GUEST_TOKEN_SECRET is not set on this deployment");
	const access = guestToken ? await readGuestAccess(secret, guestToken) : null;
	// Writes need a current token so the network is current; reads may use
	// the token the page loaded with, so subscriptions do not reset hourly.
	const grace = use === "read" ? READ_GRACE_MS : 0;
	if (!access || access.exp + grace <= Date.now()) {
		throw new ConvexError({ code: "NO_SESSION" });
	}
	return { tier: "guest", ownerId: `guest:${access.sub}`, network: `net:${access.net}` };
}

/** Throws FORBIDDEN unless the thread exists and belongs to `owner`. */
export async function authorizeThreadAccess(ctx: Ctx, threadId: string, owner: ChatOwner): Promise<void> {
	let threadOwner: string | undefined;
	try {
		threadOwner = (await getThreadMetadata(ctx, components.agent, { threadId })).userId;
	} catch {
		threadOwner = undefined;
	}
	if (!threadOwner || threadOwner !== owner.ownerId) {
		throw new ConvexError({ code: "FORBIDDEN" });
	}
}

export async function latestThreadId(ctx: Ctx, ownerId: string): Promise<string | null> {
	const { page } = await ctx.runQuery(components.agent.threads.listThreadsByUserId, {
		userId: ownerId,
		order: "desc",
		paginationOpts: { numItems: 1, cursor: null },
	});
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
