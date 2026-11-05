import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import { adminQuery } from "../_lib/customFunctions";
import { vNamespace } from "../_lib/rag";

export const list = adminQuery({
	args: { namespace: v.optional(vNamespace) },
	handler: async (ctx, { namespace }) => {
		const docs = namespace
			? await ctx.db
					.query("knowledgeDocs")
					.withIndex("by_namespace", (q) => q.eq("namespace", namespace))
					.collect()
			: await ctx.db.query("knowledgeDocs").collect();
		return docs
			.sort((a, b) => b.updatedAt - a.updatedAt)
			.map(({ content, ...rest }) => ({ ...rest, length: content.length }));
	},
});

export const get = adminQuery({
	args: { docId: v.id("knowledgeDocs") },
	handler: async (ctx, { docId }) => await ctx.db.get(docId),
});

export const getForIngest = internalQuery({
	args: { docId: v.id("knowledgeDocs") },
	handler: async (ctx, { docId }) => await ctx.db.get(docId),
});

/** Index status of the doc mirroring a blog post or project, for the editors. */
export const statusForSource = adminQuery({
	args: {
		source: v.union(v.literal("blog"), v.literal("project")),
		sourceKey: v.string(),
	},
	handler: async (ctx, { source, sourceKey }) => {
		const doc = await ctx.db
			.query("knowledgeDocs")
			.withIndex("by_source", (q) =>
				q.eq("source", source).eq("sourceKey", sourceKey),
			)
			.unique();
		return doc
			? { status: doc.status, chunkCount: doc.chunkCount ?? null, error: doc.error ?? null }
			: null;
	},
});
