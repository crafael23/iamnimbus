import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { needsScreening, SOURCE_GATE_VERSION } from "../_lib/knowledge";
import { rag, vNamespace } from "../_lib/rag";
import { checkContent } from "../_lib/safety";

/**
 * Chunk, embed and index one knowledge doc. Superseded versions are skipped;
 * markIngested re-checks the version afterwards so the newest content wins
 * even if two ingests finish out of order.
 *
 * Outside content (GitHub repos, whose READMEs other people can write) is
 * judged for prompt injection first. A flagged doc is not indexed, any older
 * copy is removed from the index, and the doc is marked failed with the
 * reason; failed docs are re-checked on the next sync.
 */
export const ingest = internalAction({
	args: { docId: v.id("knowledgeDocs"), version: v.number() },
	handler: async (ctx, { docId, version }) => {
		const doc = await ctx.runQuery(internal.knowledge.queries.getForIngest, {
			docId,
		});
		if (!doc || doc.version !== version) return;
		if (needsScreening(doc)) {
			const verdict = await checkContent("source", { title: doc.title, content: doc.content });
			if (verdict.cost > 0) {
				// A fraction of a cent; never let bookkeeping block indexing.
				await ctx
					.runMutation(internal.billing.internal.record, { costUsd: verdict.cost })
					.catch((e: unknown) => console.error("could not record judge cost", e));
			}
			if (verdict.flagged) {
				const ns = await rag.getNamespace(ctx, { namespace: doc.namespace });
				if (ns) await rag.deleteByKey(ctx, { namespaceId: ns.namespaceId, key: docId });
				await ctx.runMutation(internal.knowledge.mutations.markFailed, {
					docId,
					version,
					error: verdict.error
						? `Not indexed: the prompt-injection check was unavailable (${verdict.error.slice(0, 120)}). Retried on the next sync.`
						: `Held back: reads like instructions aimed at the AI (prompt-injection check, p=${verdict.probability.toFixed(2)}).`,
				});
				return;
			}
		}
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
				screenedVersion: needsScreening(doc) ? SOURCE_GATE_VERSION : undefined,
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
