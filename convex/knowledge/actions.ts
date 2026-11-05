import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { rag, vNamespace } from "../_lib/rag";

/**
 * Chunk, embed and index one knowledge doc. Superseded versions are skipped;
 * markIngested re-checks the version afterwards so the newest content wins
 * even if two ingests finish out of order.
 */
export const ingest = internalAction({
	args: { docId: v.id("knowledgeDocs"), version: v.number() },
	handler: async (ctx, { docId, version }) => {
		const doc = await ctx.runQuery(internal.knowledge.queries.getForIngest, {
			docId,
		});
		if (!doc || doc.version !== version) return;
		try {
			const { entryId } = await rag.add(ctx, {
				namespace: doc.namespace,
				key: docId,
				title: doc.title,
				text: `# ${doc.title}\n\n${doc.content}`,
				metadata: { source: doc.source },
			});
			const chunks = await rag.listChunks(ctx, {
				entryId,
				paginationOpts: { numItems: 500, cursor: null },
			});
			await ctx.runMutation(internal.knowledge.mutations.markIngested, {
				docId,
				version,
				namespace: doc.namespace,
				chunkCount: chunks.page.length,
			});
		} catch (error) {
			await ctx.runMutation(internal.knowledge.mutations.markFailed, {
				docId,
				version,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	},
});

/** Remove every RAG entry stored under a key (a deleted knowledge doc). */
export const removeFromIndex = internalAction({
	args: { namespace: vNamespace, key: v.string() },
	handler: async (ctx, { namespace, key }) => {
		const ns = await rag.getNamespace(ctx, { namespace });
		if (!ns) return;
		await rag.deleteByKey(ctx, { namespaceId: ns.namespaceId, key });
	},
});

