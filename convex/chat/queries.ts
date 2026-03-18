import {
	listUIMessages,
	syncStreams,
	vStreamArgs,
} from "@convex-dev/agent";
import { paginationOptsValidator } from "convex/server";
import { components } from "../_generated/api";
import { query } from "../_generated/server";
import { v } from "convex/values";
import { authorizeThreadAccess } from "./threads";

/**
 * List thread messages with streaming deltas.
 * Use with useUIMessages(api.chat.queries.listThreadMessages, { threadId }, { stream: true }).
 */
export const listThreadMessages = query({
	args: {
		threadId: v.string(),
		paginationOpts: paginationOptsValidator,
		streamArgs: vStreamArgs,
	},
	handler: async (ctx, args) => {
		const { threadId, streamArgs } = args;
		await authorizeThreadAccess(ctx, threadId);

		const streams = await syncStreams(ctx, components.agent, {
			threadId,
			streamArgs,
		});

		const paginated = await listUIMessages(ctx, components.agent, args);

		return {
			...paginated,
			streams,
		};
	},
});
