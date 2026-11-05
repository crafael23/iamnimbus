import { v } from "convex/values";
import { query } from "../_generated/server";
import { adminQuery } from "../_lib/customFunctions";

/** Public: published posts only, newest first. Drafts never leave the server. */
export const listPublished = query({
	args: {},
	handler: async (ctx) => {
		const posts = await ctx.db
			.query("blogPosts")
			.withIndex("by_status_publishedAt", (q) => q.eq("status", "published"))
			.order("desc")
			.take(100);
		return posts.map(({ content, ...post }) => ({
			...post,
			readingMinutes: readingMinutes(content),
		}));
	},
});

/** Public: null for drafts and unknown slugs alike. */
export const getPublishedBySlug = query({
	args: { slug: v.string() },
	handler: async (ctx, { slug }) => {
		const post = await ctx.db
			.query("blogPosts")
			.withIndex("by_slug", (q) => q.eq("slug", slug))
			.unique();
		if (!post || post.status !== "published") return null;
		return { ...post, readingMinutes: readingMinutes(post.content) };
	},
});

export const adminList = adminQuery({
	args: {},
	handler: async (ctx) => {
		const posts = await ctx.db.query("blogPosts").order("desc").take(200);
		return posts
			.sort((a, b) => b.updatedAt - a.updatedAt)
			.map(({ content, ...post }) => ({ ...post, length: content.length }));
	},
});

export const adminGet = adminQuery({
	args: { postId: v.id("blogPosts") },
	handler: async (ctx, { postId }) => await ctx.db.get(postId),
});

function readingMinutes(content: string) {
	return Math.max(1, Math.round(content.split(/\s+/).length / 220));
}
