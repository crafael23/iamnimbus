import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { findRepo, refreshRepoDoc, repoKey, vSyncedRepo } from "../_lib/github";
import { removeDerivedDoc } from "../_lib/knowledge";

/**
 * Replace the synced repo set. Rows and knowledge docs for repos that are gone
 * are removed; a project linked to one keeps its link (a later sync may bring
 * the repo back) but shows no repo details until then.
 */
export const applySync = internalMutation({
	args: { username: v.string(), repos: v.array(vSyncedRepo) },
	handler: async (ctx, { username, repos }) => {
		const now = Date.now();
		// Project links saved before keys were normalized: lowercase them first so
		// the lookups below (and every later save) see them.
		const projects = await ctx.db.query("projects").collect();
		await Promise.all(
			projects.flatMap((project) =>
				project.githubRepo && project.githubRepo !== repoKey(project.githubRepo)
					? [ctx.db.patch("projects", project._id, { githubRepo: repoKey(project.githubRepo) })]
					: [],
			),
		);
		// Rows and docs from before keys were normalized drop out below and are
		// recreated under their lowercase key.
		// One entry per key, so no two writes below touch the same repo.
		const byKey = new Map(
			repos.map((synced) => {
				const fullName = repoKey(synced.fullName);
				return [fullName, { ...synced, fullName, syncedAt: now }];
			}),
		);
		await Promise.all(
			[...byKey.values()].map(async (repo) => {
				const existing = await findRepo(ctx, repo.fullName);
				if (existing) {
					await ctx.db.replace("githubRepos", existing._id, repo);
				} else {
					await ctx.db.insert("githubRepos", repo);
				}
				await refreshRepoDoc(ctx, repo.fullName);
			}),
		);

		const rows = await ctx.db.query("githubRepos").collect();
		await Promise.all(
			rows.filter((row) => !byKey.has(row.fullName)).map((row) => ctx.db.delete("githubRepos", row._id)),
		);
		const docs = await ctx.db
			.query("knowledgeDocs")
			.withIndex("by_source", (q) => q.eq("source", "github"))
			.collect();
		const gone = docs.flatMap((doc) => (doc.sourceKey && !byKey.has(doc.sourceKey) ? [doc.sourceKey] : []));
		await Promise.all(gone.map((key) => removeDerivedDoc(ctx, "github", key)));
		const removed = gone.length;

		await ctx.db.insert("githubSyncRuns", {
			username,
			status: "ok",
			repoCount: repos.length,
			finishedAt: now,
		});
		return { synced: repos.length, removed };
	},
});

export const recordFailure = internalMutation({
	args: { username: v.string(), error: v.string() },
	handler: async (ctx, { username, error }) => {
		await ctx.db.insert("githubSyncRuns", {
			username,
			status: "error",
			repoCount: 0,
			error: error.slice(0, 500),
			finishedAt: Date.now(),
		});
	},
});
