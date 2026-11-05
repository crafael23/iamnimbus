import { HOUR, RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "../_generated/api";

const DAY = 24 * HOUR;

export const GUEST_MESSAGE_LIMIT = 10;
export const GUEST_NOTICE_AT = 7;
export const REGISTERED_MESSAGE_LIMIT = 30;

/**
 * Chat limits, all enforced inside the sendMessage mutation.
 *
 * - guestMessages: 10 per guest session id. A token bucket with a 7-day period
 *   behaves like a per-session cap: the 10 tokens refill at ~1.4 per day, so a
 *   gated guest stays gated for the visit.
 * - registeredMessages: 30 per rolling 24h (token bucket refills continuously).
 * - guestGlobal: backstop across all guests so rotating session ids cannot
 *   drain gateway credits.
 * - threadCreate: caps thread creation per owner.
 */
export const rateLimiter = new RateLimiter(components.rateLimiter, {
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
