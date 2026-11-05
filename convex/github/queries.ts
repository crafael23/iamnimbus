import { adminQuery } from "../_lib/customFunctions";

export const lastRun = adminQuery({
	args: {},
	handler: async (ctx) => {
		const run = await ctx.db.query("githubSyncRuns").order("desc").first();
		return {
			run,
			username: process.env.GITHUB_USERNAME ?? null,
			hasToken: Boolean(process.env.GITHUB_TOKEN),
		};
	},
});
