import { v } from "convex/values";
import { query } from "../_generated/server";
import { adminQuery } from "../_lib/customFunctions";

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

export const getBySlug = query({
	args: { slug: v.string() },
	handler: async (ctx, { slug }) =>
		await ctx.db
			.query("projects")
			.withIndex("by_slug", (q) => q.eq("slug", slug))
			.unique(),
});

export const adminGet = adminQuery({
	args: { projectId: v.id("projects") },
	handler: async (ctx, { projectId }) => await ctx.db.get(projectId),
});
