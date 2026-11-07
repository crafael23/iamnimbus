import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";
import { adminMutation } from "../_lib/customFunctions";
import {
	createKnowledgeDoc,
	deleteKnowledgeDoc,
	reingestKnowledgeDoc,
	updateKnowledgeDoc,
} from "../_lib/knowledge";
import { vAsOf, type AsOf } from "../_lib/asOf";
import { vNamespace } from "../_lib/rag";

const MAX_DOC_LENGTH = 200_000;

function validate(title: string, content: string, asOf: AsOf | undefined) {
	if (!title.trim()) throw new ConvexError("Title is required");
	if (content.length > MAX_DOC_LENGTH) {
		throw new ConvexError("Document is too long");
	}
	if (typeof asOf === "number" && !(asOf >= Date.UTC(1970, 0, 1) && asOf <= Date.now() + 366 * 86_400_000)) {
		throw new ConvexError("The as-of date must be a real date, at most a year ahead");
	}
}

/** Manual docs only. Blog, project and GitHub docs are edited at their source. */
export const create = adminMutation({
	args: {
		namespace: vNamespace,
		title: v.string(),
		content: v.string(),
		asOf: v.optional(vAsOf),
	},
	handler: async (ctx, args) => {
		validate(args.title, args.content, args.asOf);
		return await createKnowledgeDoc(ctx, { ...args, source: "manual" });
	},
});

export const update = adminMutation({
	args: {
		docId: v.id("knowledgeDocs"),
		title: v.string(),
		content: v.string(),
		/** Omitted clears the date. */
		asOf: v.optional(vAsOf),
	},
	handler: async (ctx, { docId, title, content, asOf }) => {
		validate(title, content, asOf);
		const doc = await ctx.db.get("knowledgeDocs", docId);
		if (!doc) throw new ConvexError("Document not found");
		if (doc.source !== "manual") {
			throw new ConvexError(`Edit this document from its ${doc.source} source`);
		}
		// The date only affects ranking: changing it alone needs no re-embedding.
		if (doc.asOf !== asOf) await ctx.db.patch("knowledgeDocs", docId, { asOf });
		if (doc.title !== title || doc.content !== content) {
			await updateKnowledgeDoc(ctx, doc, { title, content });
		}
	},
});

export const remove = adminMutation({
	args: { docId: v.id("knowledgeDocs") },
	handler: async (ctx, { docId }) => {
		const doc = await ctx.db.get("knowledgeDocs", docId);
		if (!doc) return;
		if (doc.source !== "manual") {
			throw new ConvexError(`Remove this document from its ${doc.source} source`);
		}
		await deleteKnowledgeDoc(ctx, doc);
	},
});

export const reingest = adminMutation({
	args: { docId: v.id("knowledgeDocs") },
	handler: async (ctx, { docId }) => {
		const doc = await ctx.db.get("knowledgeDocs", docId);
		if (!doc) throw new ConvexError("Document not found");
		await reingestKnowledgeDoc(ctx, doc);
	},
});

export const markIngested = internalMutation({
	args: {
		docId: v.id("knowledgeDocs"),
		version: v.number(),
		namespace: vNamespace,
		chunkCount: v.number(),
		screenedVersion: v.optional(v.number()),
	},
	handler: async (ctx, { docId, version, namespace, chunkCount, screenedVersion }) => {
		const doc = await ctx.db.get("knowledgeDocs", docId);
		if (!doc) {
			// Deleted while ingesting: drop the vectors this run just wrote.
			await ctx.scheduler.runAfter(0, internal.knowledge.actions.removeFromIndex, {
				namespace,
				key: docId,
			});
			return;
		}
		if (doc.version !== version) {
			// A newer edit landed mid-ingest. Re-index the newest version last so
			// an out-of-order finish cannot leave stale content in the index.
			await ctx.scheduler.runAfter(0, internal.knowledge.actions.ingest, {
				docId,
				version: doc.version,
			});
			return;
		}
		await ctx.db.patch("knowledgeDocs", docId, {
			status: "ready",
			error: undefined,
			screenedVersion,
			chunkCount,
			ingestedAt: Date.now(),
		});
	},
});

export const markFailed = internalMutation({
	args: { docId: v.id("knowledgeDocs"), version: v.number(), error: v.string() },
	handler: async (ctx, { docId, version, error }) => {
		const doc = await ctx.db.get("knowledgeDocs", docId);
		if (!doc || doc.version !== version) return;
		await ctx.db.patch("knowledgeDocs", docId, { status: "error", error: error.slice(0, 500) });
	},
});
