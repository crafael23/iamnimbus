import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { removeDerivedDoc, upsertDerivedDoc } from "../_lib/knowledge";

export const applySync = internalMutation({
	args: {
		username: v.string(),
		repos: v.array(
			v.object({ fullName: v.string(), title: v.string(), content: v.string() }),
		),
	},
	handler: async (ctx, { username, repos }) => {
		const keep = new Set(repos.map((r) => r.fullName));
		for (const repo of repos) {
			await upsertDerivedDoc(ctx, {
				namespace: "github",
				source: "github",
				sourceKey: repo.fullName,
				title: repo.title,
				content: repo.content,
			});
		}
		const existing = await ctx.db
			.query("knowledgeDocs")
			.withIndex("by_source", (q) => q.eq("source", "github"))
			.collect();
		let removed = 0;
		for (const doc of existing) {
			if (doc.sourceKey && !keep.has(doc.sourceKey)) {
				await removeDerivedDoc(ctx, "github", doc.sourceKey);
				removed++;
			}
		}
		await ctx.db.insert("githubSyncRuns", {
			username,
			status: "ok",
			repoCount: repos.length,
			finishedAt: Date.now(),
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
