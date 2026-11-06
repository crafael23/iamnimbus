import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import { adminQuery } from "../_lib/customFunctions";
import { isScreened } from "../_lib/knowledge";
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

/** Which of these RAG entry keys still name a knowledge doc. */
/**
 * The keys the agent may use: docs that still exist and, for outside
 * sources, whose content passed the current prompt-injection gate.
 */
export const existingDocIds = internalQuery({
	args: { keys: v.array(v.string()) },
	handler: async (ctx, { keys }) => {
		const live: string[] = [];
		for (const key of keys) {
			const id = ctx.db.normalizeId("knowledgeDocs", key);
			const doc = id ? await ctx.db.get(id) : null;
			if (doc && isScreened(doc)) live.push(key);
		}
		return live;
	},
});
