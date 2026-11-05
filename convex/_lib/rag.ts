import { convexGateway } from "@convex-dev/ai-sdk-provider";
import { RAG } from "@convex-dev/rag";
import { embed } from "ai";
import { components } from "../_generated/api";
import { NAMESPACES, type Namespace } from "./namespaces";

export { NAMESPACES, vNamespace, type Namespace } from "./namespaces";

export const EMBEDDING_MODEL = "openai/text-embedding-3-small";
export const EMBEDDING_DIMENSION = 1536;


export const textEmbeddingModel = () =>
	convexGateway.embeddingModel(EMBEDDING_MODEL);

/**
 * One RAG instance for the whole knowledge base. Each knowledge namespace is a
 * separate RAG namespace; entries are keyed by their `knowledgeDocs` id.
 */
export const rag = new RAG(components.rag, {
	textEmbeddingModel: textEmbeddingModel(),
	embeddingDimension: EMBEDDING_DIMENSION,
});

type SearchCtx = Parameters<typeof rag.search>[0];

export type KnowledgeHit = {
	namespace: Namespace;
	title: string;
	score: number;
	text: string;
};

/**
 * Semantic search over one namespace, or all of them. For "all", the query is
 * embedded once and the vector is reused for each namespace search.
 */
export async function searchKnowledgeBase(
	ctx: SearchCtx,
	args: { query: string; namespace?: Namespace; limit?: number },
): Promise<KnowledgeHit[]> {
	const limit = args.limit ?? 6;
	const namespaces = args.namespace ? [args.namespace] : [...NAMESPACES];
	let query: string | number[] = args.query;
	if (namespaces.length > 1) {
		const { embedding } = await embed({
			model: textEmbeddingModel(),
			value: args.query,
		});
		query = embedding;
	}
	const perNamespace = await Promise.all(
		namespaces.map(async (namespace) => {
			const { results, entries } = await rag.search(ctx, {
				namespace,
				query,
				limit: 4,
				chunkContext: { before: 1, after: 1 },
				vectorScoreThreshold: 0.25,
			});
			const titles = new Map(entries.map((e) => [e.entryId, e.title]));
			return results.map((r) => ({
				namespace,
				title: titles.get(r.entryId) ?? "Untitled",
				score: r.score,
				text: r.content.map((c) => c.text).join("\n"),
			}));
		}),
	);
	return perNamespace
		.flat()
		.sort((a, b) => b.score - a.score)
		.slice(0, limit);
}
