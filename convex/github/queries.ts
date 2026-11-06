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

/** Synced repos for the project editor's picker, with the project each is linked to. */
export const repos = adminQuery({
	args: {},
	handler: async (ctx) => {
		const [rows, projects] = await Promise.all([
			ctx.db.query("githubRepos").collect(),
			ctx.db.query("projects").take(500),
		]);
		const linked = new Map(
			projects.flatMap((p) => (p.githubRepo ? [[p.githubRepo, p] as const] : [])),
		);
		return rows
			.sort((a, b) => b.pushedAt - a.pushedAt)
			.map((r) => {
				const project = linked.get(r.fullName);
				return {
					fullName: r.fullName,
					description: r.description ?? null,
					pushedAt: r.pushedAt,
					linkedProject: project ? { _id: project._id, title: project.title } : null,
				};
			});
	},
});
