import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { adminMutation } from "../_lib/customFunctions";
import { removeDerivedDoc, upsertDerivedDoc } from "../_lib/knowledge";
import { assertSlug } from "../_lib/slug";

const vPostFields = {
	slug: v.string(),
	title: v.string(),
	excerpt: v.string(),
	content: v.string(),
};

async function assertSlugFree(ctx: MutationCtx, slug: string, postId?: Id<"blogPosts">) {
	assertSlug(slug);
	const clash = await ctx.db
		.query("blogPosts")
		.withIndex("by_slug", (q) => q.eq("slug", slug))
		.first();
	if (clash && clash._id !== postId) {
		throw new ConvexError("Another post already uses this slug");
	}
}

function knowledgeContent(post: Doc<"blogPosts">) {
	const date = post.publishedAt ? new Date(post.publishedAt).toISOString().slice(0, 10) : "";
	return `Blog post published ${date} at /blog/${post.slug}\n\n${post.excerpt}\n\n${post.content}`;
}

/** Publishing and indexing happen in the same transaction (and unpublishing). */
async function syncIndex(ctx: MutationCtx, post: Doc<"blogPosts">) {
	if (post.status === "published") {
		await upsertDerivedDoc(ctx, {
			namespace: "blog",
			source: "blog",
			sourceKey: post._id,
			title: post.title,
			content: knowledgeContent(post),
			asOf: post.publishedAt,
		});
	} else {
		await removeDerivedDoc(ctx, "blog", post._id);
	}
}

export const create = adminMutation({
	args: vPostFields,
	handler: async (ctx, fields) => {
		if (!fields.title.trim()) throw new ConvexError("Title is required");
		await assertSlugFree(ctx, fields.slug);
		return await ctx.db.insert("blogPosts", {
			...fields,
			status: "draft",
			updatedAt: Date.now(),
		});
	},
});

/** Saving a published post re-ingests it so the AI never reads stale text. */
export const update = adminMutation({
	args: { postId: v.id("blogPosts"), ...vPostFields },
	handler: async (ctx, { postId, ...fields }) => {
		const post = await ctx.db.get("blogPosts", postId);
		if (!post) throw new ConvexError("Post not found");
		if (!fields.title.trim()) throw new ConvexError("Title is required");
		await assertSlugFree(ctx, fields.slug, postId);
		await ctx.db.patch("blogPosts", postId, { ...fields, updatedAt: Date.now() });
		await syncIndex(ctx, { ...post, ...fields });
	},
});

export const publish = adminMutation({
	args: { postId: v.id("blogPosts") },
	handler: async (ctx, { postId }) => {
		const post = await ctx.db.get("blogPosts", postId);
		if (!post) throw new ConvexError("Post not found");
		const publishedAt = post.publishedAt ?? Date.now();
		await ctx.db.patch("blogPosts", postId, {
			status: "published",
			publishedAt,
			updatedAt: Date.now(),
		});
		await syncIndex(ctx, { ...post, status: "published", publishedAt });
	},
});

export const unpublish = adminMutation({
	args: { postId: v.id("blogPosts") },
	handler: async (ctx, { postId }) => {
		const post = await ctx.db.get("blogPosts", postId);
		if (!post) throw new ConvexError("Post not found");
		await ctx.db.patch("blogPosts", postId, { status: "draft", updatedAt: Date.now() });
		await syncIndex(ctx, { ...post, status: "draft" });
	},
});

export const remove = adminMutation({
	args: { postId: v.id("blogPosts") },
	handler: async (ctx, { postId }) => {
		const post = await ctx.db.get("blogPosts", postId);
		if (!post) return;
		await ctx.db.delete("blogPosts", postId);
		await removeDerivedDoc(ctx, "blog", postId);
	},
});
