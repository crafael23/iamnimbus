import { v } from "convex/values";
import { query } from "../_generated/server";
import { adminQuery } from "../_lib/customFunctions";
import { findRepo } from "../_lib/github";

export const list = query({
	args: {},
	handler: async (ctx) => {
		const projects = await ctx.db
			.query("projects")
			.withIndex("by_order")
			.take(100);
		return projects.map((p) => ({
			_id: p._id,
			slug: p.slug,
			title: p.title,
			summary: p.summary,
			stack: p.stack,
			year: p.year,
		}));
	},
});

/** A project with its linked repo's live details (null if the repo left the sync). */
export const getBySlug = query({
	args: { slug: v.string() },
	handler: async (ctx, { slug }) => {
		const project = await ctx.db
			.query("projects")
			.withIndex("by_slug", (q) => q.eq("slug", slug))
			.unique();
		if (!project) return null;
		const repo = project.githubRepo ? await findRepo(ctx, project.githubRepo) : null;
		return {
			...project,
			repo: repo && {
				fullName: repo.fullName,
				url: repo.url,
				description: repo.description ?? null,
				languages: repo.languages,
				topics: repo.topics,
				stars: repo.stars,
				pushedAt: repo.pushedAt,
				archived: repo.archived,
			},
		};
	},
});

export const adminGet = adminQuery({
	args: { projectId: v.id("projects") },
	handler: async (ctx, { projectId }) => await ctx.db.get(projectId),
});
