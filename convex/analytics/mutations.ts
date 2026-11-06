import { v } from "convex/values";
import { authedMutation } from "../_lib/customFunctions";
import { readGuestAccess } from "../_lib/guestToken";
import { recordEvent } from "../_lib/analytics";
import { latestThreadId, remainingMessages } from "../chat/threads";
export const convertGuest = authedMutation({
	args: { guestToken: v.string() },
	returns: v.null(),
	handler: async (ctx, { guestToken }) => {
		if (ctx.user.guestConvertedAt !== undefined) return null;
		const secret = process.env.GUEST_TOKEN_SECRET;
		const access = secret ? await readGuestAccess(secret, guestToken) : null;
		if (!access || access.exp <= Date.now()) return null;
		const owner = { tier: "guest" as const, ownerId: `guest:${access.sub}` };
		if (!(await latestThreadId(ctx, owner.ownerId))) return null;
		const atGate = (await remainingMessages(ctx, owner)) === 0;
		await ctx.db.patch(ctx.user._id, { guestConvertedAt: Date.now() });
		await recordEvent(ctx, { kind: "conversion", atGate });
		return null;
	},
});
