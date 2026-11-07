import { ConvexError, v } from "convex/values";
import { internalMutation } from "../_generated/server";
import {
	RESERVATION_TTL_MS,
	recordSpend,
	releaseReservation,
	reserveTurn,
} from "../_lib/billing";

/** Add one call's cost to this month's and today's spend. */
export const record = internalMutation({
	args: { costUsd: v.number() },
	returns: v.null(),
	handler: async (ctx, { costUsd }) => {
		await recordSpend(ctx, costUsd);
		return null;
	},
});

/** End a turn's budget hold; `charge` books the held amount as spent. */
export const release = internalMutation({
	args: { reservationId: v.id("aiReservations"), charge: v.boolean() },
	returns: v.null(),
	handler: async (ctx, { reservationId, charge }) => {
		await releaseReservation(ctx, reservationId, charge);
		return null;
	},
});

/**
 * Called when a reply starts. A live hold is renewed so it stays counted for
 * the whole reply (actions finish well inside the TTL). An expired hold, which
 * the budget no longer counts, is dropped and the turn must reserve again
 * within budget. Returns null when the budget no longer fits: the reply must
 * not run.
 */
export const claim = internalMutation({
	args: {
		reservationId: v.id("aiReservations"),
		tier: v.union(v.literal("guest"), v.literal("registered")),
	},
	returns: v.union(v.id("aiReservations"), v.null()),
	handler: async (ctx, { reservationId, tier }) => {
		const now = Date.now();
		const hold = await ctx.db.get("aiReservations", reservationId);
		if (hold && hold.createdAt > now - RESERVATION_TTL_MS) {
			await ctx.db.patch("aiReservations", reservationId, { createdAt: now });
			return reservationId;
		}
		if (hold) await ctx.db.delete("aiReservations", reservationId);
		try {
			return await reserveTurn(ctx, tier, now);
		} catch (error) {
			if (error instanceof ConvexError && (error.data as { code?: string }).code === "BUDGET") return null;
			throw error;
		}
	},
});
