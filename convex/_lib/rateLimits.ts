import { HOUR, RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "../_generated/api";

const DAY = 24 * HOUR;

export const GUEST_MESSAGE_LIMIT = 10;
export const GUEST_NOTICE_AT = 7;
export const REGISTERED_MESSAGE_LIMIT = 30;
export const GUEST_NETWORK_DAILY_LIMIT = 30;

/**
 * Chat limits, all enforced inside the sendMessage mutation.
 *
 * - guestMessages: 10 per guest id (from the signed guest cookie). A token bucket with a 7-day period
 *   behaves like a per-session cap: the 10 tokens refill at ~1.4 per day, so a
 *   gated guest stays gated for the visit.
 * - registeredMessages: 30 per rolling 24h (token bucket refills continuously).
 * - guestNetworkMessages: 30 guest messages per network (IPv4 /24, IPv6
 *   /64) per rolling day, so clearing cookies does not reset the allowance.
 *   Generous because offices and mobile carriers share addresses.
 * - guestNetworkThreads: caps new guest threads per network.
 * - registeredGlobal: generous shared cap across all signed-in users, so new
 *   accounts cannot multiply the per-user allowance without bound. The
 *   dollar budget (_lib/billing.ts) is the hard ceiling either way.
 * - guestGlobal: backstop across all guests so rotating session ids cannot
 *   drain gateway credits.
 * - threadCreate: caps thread creation per owner.
 */
export const rateLimiter = new RateLimiter(components.rateLimiter, {
	arcadeRuns: {
		kind: "token bucket",
		rate: 60,
		period: HOUR,
		capacity: 20,
	},
	arcadeRunsNetwork: {
		kind: "token bucket",
		rate: 200,
		period: HOUR,
		capacity: 60,
	},
	guestMessages: {
		kind: "token bucket",
		rate: GUEST_MESSAGE_LIMIT,
		period: 7 * DAY,
		capacity: GUEST_MESSAGE_LIMIT,
	},
	registeredMessages: {
		kind: "token bucket",
		rate: REGISTERED_MESSAGE_LIMIT,
		period: DAY,
		capacity: REGISTERED_MESSAGE_LIMIT,
	},
	guestNetworkMessages: {
		kind: "token bucket",
		rate: GUEST_NETWORK_DAILY_LIMIT,
		period: DAY,
		capacity: GUEST_NETWORK_DAILY_LIMIT,
	},
	guestNetworkThreads: {
		kind: "token bucket",
		rate: 30,
		period: HOUR,
		capacity: 30,
	},
	registeredGlobal: {
		kind: "token bucket",
		rate: 500,
		period: DAY,
		capacity: 500,
		shards: 4,
	},
	guestGlobal: {
		kind: "token bucket",
		rate: 300,
		period: HOUR,
		capacity: 300,
		shards: 4,
	},
	threadCreate: {
		kind: "token bucket",
		rate: 20,
		period: HOUR,
		capacity: 20,
	},
});
