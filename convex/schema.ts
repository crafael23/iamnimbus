import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { vNamespace } from "./_lib/namespaces";

export const vKnowledgeSource = v.union(
	v.literal("manual"),
	v.literal("blog"),
	v.literal("project"),
	v.literal("github"),
);

export const vIngestStatus = v.union(
	v.literal("pending"),
	v.literal("ready"),
	v.literal("error"),
);

export default defineSchema({
	users: defineTable({
		authId: v.optional(v.string()), // WorkOS user id, from webhook event.data.id
		tokenIdentifier: v.string(), // Convex auth lookup, same as authId for WorkOS
		name: v.string(),
		email: v.string(),
		pictureUrl: v.optional(v.string()),
		role: v.optional(v.string()), // WorkOS org membership role slug (member, admin, etc.)
		// Ordering for membership webhooks, which can arrive late or twice:
		// the membership the role came from, its last update, and the last
		// deleted membership (never resurrected by a stale event).
		membershipId: v.optional(v.string()),
		membershipUpdatedAt: v.optional(v.number()),
		revokedMembershipId: v.optional(v.string()),
		createdAt: v.number(),
		updatedAt: v.optional(v.number()),
	})
		.index("by_token", ["tokenIdentifier"])
		.index("by_authId", ["authId"])
		.index("by_email", ["email"]),

	/**
	 * Every document in the knowledge base. Manual docs are authored in the
	 * admin; blog/project/github docs are derived from their source record and
	 * kept in sync by that record's mutations. The RAG entry key is the doc id.
	 */
	knowledgeDocs: defineTable({
		namespace: vNamespace,
		title: v.string(),
		content: v.string(),
		source: vKnowledgeSource,
		sourceKey: v.optional(v.string()),
		status: vIngestStatus,
		error: v.optional(v.string()),
		version: v.number(),
		chunkCount: v.optional(v.number()),
		ingestedAt: v.optional(v.number()),
		/** Prompt-injection gate version this content passed (outside sources only). */
		screenedVersion: v.optional(v.number()),
		updatedAt: v.number(),
	})
		.index("by_namespace", ["namespace"])
		.index("by_source", ["source", "sourceKey"]),

	blogPosts: defineTable({
		slug: v.string(),
		title: v.string(),
		excerpt: v.string(),
		content: v.string(),
		status: v.union(v.literal("draft"), v.literal("published")),
		publishedAt: v.optional(v.number()),
		updatedAt: v.number(),
	})
		.index("by_slug", ["slug"])
		.index("by_status_publishedAt", ["status", "publishedAt"]),

	projects: defineTable({
		slug: v.string(),
		title: v.string(),
		summary: v.string(),
		problem: v.string(),
		solution: v.string(),
		stack: v.array(v.string()),
		decisions: v.string(),
		outcome: v.string(),
		year: v.optional(v.string()),
		/** A synced repo's `owner/name`; at most one project per repo. */
		githubRepo: v.optional(v.string()),
		/** Repository link for repos outside the sync; unused when githubRepo is set. */
		repoUrl: v.optional(v.string()),
		liveUrl: v.optional(v.string()),
		order: v.number(),
		updatedAt: v.number(),
	})
		.index("by_slug", ["slug"])
		.index("by_order", ["order"])
		.index("by_githubRepo", ["githubRepo"]),

	/** One row per repo in the last GitHub sync, replaced on every sync. */
	githubRepos: defineTable({
		fullName: v.string(),
		name: v.string(),
		url: v.string(),
		description: v.optional(v.string()),
		homepage: v.optional(v.string()),
		/** Share of code by language, largest first, in whole percent. */
		languages: v.array(v.object({ name: v.string(), percent: v.number() })),
		topics: v.array(v.string()),
		stars: v.number(),
		forks: v.number(),
		archived: v.boolean(),
		createdAt: v.number(),
		pushedAt: v.number(),
		readme: v.optional(v.string()),
		syncedAt: v.number(),
	}).index("by_fullName", ["fullName"]),

	/** Append-only. The newest version is the active prompt. */
	systemPromptVersions: defineTable({
		content: v.string(),
		note: v.optional(v.string()),
		authorId: v.optional(v.id("users")),
		restoredFrom: v.optional(v.id("systemPromptVersions")),
	}),

	/**
	 * AI spend in US dollars per month ("2026-11") and per day ("2026-11-05"),
	 * UTC, spread over a few shards so concurrent calls do not contend on one
	 * row. Written after every model or judge call; summed by sendMessage to
	 * enforce the budget.
	 */
	aiSpend: defineTable({
		period: v.string(),
		shard: v.optional(v.number()),
		costUsd: v.number(),
		calls: v.number(),
	}).index("by_period_shard", ["period", "shard"]),

	/**
	 * Worst-case cost held for each accepted chat turn until it finishes, so
	 * queued turns cannot overshoot the budget. Rows older than the TTL in
	 * _lib/billing.ts are ignored (a crashed turn cannot hold money forever).
	 */
	aiReservations: defineTable({
		amountUsd: v.number(),
		createdAt: v.number(),
	}).index("by_createdAt", ["createdAt"]),

	githubSyncRuns: defineTable({
		username: v.string(),
		status: v.union(v.literal("ok"), v.literal("error")),
		repoCount: v.number(),
		error: v.optional(v.string()),
		finishedAt: v.number(),
	}),
});
