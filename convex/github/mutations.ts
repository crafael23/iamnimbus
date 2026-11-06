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
		// Rows and docs from before keys were normalized drop out below and are
		// recreated under their lowercase key.
		const keep = new Set(repos.map((r) => repoKey(r.fullName)));
		for (const synced of repos) {
			const repo = { ...synced, fullName: repoKey(synced.fullName), syncedAt: now };
			const existing = await findRepo(ctx, repo.fullName);
			if (existing) {
				await ctx.db.replace(existing._id, repo);
			} else {
				await ctx.db.insert("githubRepos", repo);
			}
			await refreshRepoDoc(ctx, repo.fullName);
		}

		let removed = 0;
		for (const row of await ctx.db.query("githubRepos").collect()) {
			if (!keep.has(row.fullName)) await ctx.db.delete(row._id);
		}
		const docs = await ctx.db
			.query("knowledgeDocs")
			.withIndex("by_source", (q) => q.eq("source", "github"))
			.collect();
		for (const doc of docs) {
			if (doc.sourceKey && !keep.has(doc.sourceKey)) {
				await removeDerivedDoc(ctx, "github", doc.sourceKey);
				removed++;
			}
		}

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
