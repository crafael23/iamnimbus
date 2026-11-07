import type { Infer } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { vKnowledgeSource } from "../schema";
import type { AsOf } from "./asOf";
import type { Namespace } from "./namespaces";

type KnowledgeSource = Infer<typeof vKnowledgeSource>;

/**
 * Knowledge-base write helpers. Every write to `knowledgeDocs` goes through
 * these so the RAG index follows in the same transaction: a doc is saved as
 * `pending` and its ingestion is scheduled atomically with the save.
 */

async function scheduleIngest(
	ctx: MutationCtx,
	docId: Id<"knowledgeDocs">,
	version: number,
) {
	await ctx.scheduler.runAfter(0, internal.knowledge.actions.ingest, {
		docId,
		version,
	});
}

export async function createKnowledgeDoc(
	ctx: MutationCtx,
	fields: {
		namespace: Namespace;
		title: string;
		content: string;
		source: KnowledgeSource;
		sourceKey?: string;
		asOf?: AsOf;
	},
): Promise<Id<"knowledgeDocs">> {
	const docId = await ctx.db.insert("knowledgeDocs", {
		...fields,
		status: "pending",
		version: 1,
		updatedAt: Date.now(),
	});
	await scheduleIngest(ctx, docId, 1);
	return docId;
}

export async function updateKnowledgeDoc(
	ctx: MutationCtx,
	doc: Doc<"knowledgeDocs">,
	fields: { title: string; content: string },
) {
	const version = doc.version + 1;
	await ctx.db.patch("knowledgeDocs", doc._id, {
		...fields,
		status: "pending",
		error: undefined,
		version,
		updatedAt: Date.now(),
	});
	await scheduleIngest(ctx, doc._id, version);
}

export async function reingestKnowledgeDoc(
	ctx: MutationCtx,
	doc: Doc<"knowledgeDocs">,
) {
	await updateKnowledgeDoc(ctx, doc, {
		title: doc.title,
		content: doc.content,
	});
}

export async function deleteKnowledgeDoc(
	ctx: MutationCtx,
	doc: Doc<"knowledgeDocs">,
) {
	await ctx.db.delete("knowledgeDocs", doc._id);
	await ctx.scheduler.runAfter(0, internal.knowledge.actions.removeFromIndex, {
		namespace: doc.namespace,
		key: doc._id,
	});
}

async function findDerivedDoc(
	ctx: MutationCtx,
	source: KnowledgeSource,
	sourceKey: string,
) {
	return await ctx.db
		.query("knowledgeDocs")
		.withIndex("by_source", (q) =>
			q.eq("source", source).eq("sourceKey", sourceKey),
		)
		.unique();
}

/** Create or refresh the knowledge doc that mirrors a blog post, project or repo. */
/**
 * Outside content must pass the prompt-injection gate (knowledge/actions.ts
 * ingest) before the agent may read it. Bump this when the gate changes so
 * every outside doc is re-checked on the next sync.
 */
export const SOURCE_GATE_VERSION = 1;

export const needsScreening = (doc: Pick<Doc<"knowledgeDocs">, "source">) =>
	doc.source === "github";

/** Whether the agent may read this doc's indexed content. */
export const isScreened = (doc: Pick<Doc<"knowledgeDocs">, "source" | "screenedVersion">) =>
	!needsScreening(doc) || doc.screenedVersion === SOURCE_GATE_VERSION;

export async function upsertDerivedDoc(
	ctx: MutationCtx,
	fields: {
		namespace: Namespace;
		source: Exclude<KnowledgeSource, "manual">;
		sourceKey: string;
		title: string;
		content: string;
		asOf?: AsOf;
	},
) {
	const existing = await findDerivedDoc(ctx, fields.source, fields.sourceKey);
	if (!existing) {
		return await createKnowledgeDoc(ctx, fields);
	}
	// The date only affects ranking, so changing it needs no re-embedding.
	if (existing.asOf !== fields.asOf) {
		await ctx.db.patch("knowledgeDocs", existing._id, { asOf: fields.asOf });
	}
	const unchanged =
		existing.title === fields.title &&
		existing.content === fields.content &&
		existing.status !== "error" &&
		isScreened(existing);
	if (!unchanged) {
		await updateKnowledgeDoc(ctx, existing, {
			title: fields.title,
			content: fields.content,
		});
	}
	return existing._id;
}

export async function removeDerivedDoc(
	ctx: MutationCtx,
	source: Exclude<KnowledgeSource, "manual">,
	sourceKey: string,
) {
	const existing = await findDerivedDoc(ctx, source, sourceKey);
	if (existing) {
		await deleteKnowledgeDoc(ctx, existing);
	}
}
