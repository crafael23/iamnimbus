import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { recordSpend, releaseReservation } from "../_lib/billing";

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
