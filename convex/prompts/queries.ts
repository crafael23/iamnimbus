import { internalQuery } from "../_generated/server";
import { adminQuery } from "../_lib/customFunctions";
import { PLACEHOLDER_PERSONA } from "../_lib/persona";

/** All versions, newest first. The first one is active. */
export const listVersions = adminQuery({
	args: {},
	handler: async (ctx) => {
		const versions = await ctx.db
			.query("systemPromptVersions")
			.order("desc")
			.take(200);
		return versions.map((version, i) => ({
			...version,
			number: versions.length - i,
			active: i === 0,
		}));
	},
});

/** The prompt the agent uses, read fresh on every chat request. */
export const activeContent = internalQuery({
	args: {},
	handler: async (ctx) => {
		const latest = await ctx.db
			.query("systemPromptVersions")
			.order("desc")
			.first();
		return latest?.content ?? PLACEHOLDER_PERSONA;
	},
});
