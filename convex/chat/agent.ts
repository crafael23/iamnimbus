import { Agent, createTool, stepCountIs } from "@convex-dev/agent";
import { convexGateway } from "@convex-dev/ai-sdk-provider";
import { z } from "zod";
import { components, internal } from "../_generated/api";
import { costOf } from "../_lib/billing";
import { PLACEHOLDER_PERSONA, type Tier } from "../_lib/persona";
import { type AsOf, asOfLabel, rankByRecency } from "../_lib/asOf";
import { NAMESPACES, searchKnowledgeBase } from "../_lib/rag";

/**
 * Models are chosen on the server from auth state only (see chat/mutations
 * sendMessage). Clients never send a tier or a model.
 */
export const MODELS: Record<Tier, string> = {
	guest: "anthropic/claude-haiku-5.5",
	registered: "anthropic/claude-sonnet-5.5",
};

const MAX_OUTPUT_TOKENS: Record<Tier, number> = {
	guest: 1024,
	registered: 2048,
};

/** Search results handed to the model per call. */
const MAX_HITS = 6;

const searchKnowledge = createTool({
	description:
		"Search the portfolio owner's knowledge base for facts about their projects, history, skills, goals, published writing and GitHub repositories. Use it only when the visitor asks something specific that these records can answer. Each result is marked \"current\" or \"as of <month year>\" when its date is known: describe older work in the past tense and only call something current when it is marked so.",
	inputSchema: z.object({
		query: z
			.string()
			.describe("What to look for, phrased as a search query."),
		namespace: z
			.enum(NAMESPACES)
			.optional()
			.describe(
				"Restrict to one namespace when the question clearly belongs to it. Omit to search everything.",
			),
	}),
	execute: async (ctx, { query, namespace }): Promise<string> => {
		const found = await searchKnowledgeBase(ctx, { query, namespace });
		// Vector removal is scheduled, so a just-unpublished or deleted doc can
		// still match for a moment. Only return hits whose doc still exists.
		const live: { key: string; asOf?: AsOf }[] = await ctx.runQuery(
			internal.knowledge.queries.existingDocIds,
			{ keys: [...new Set(found.flatMap((h) => (h.key ? [h.key] : [])))] },
		);
		const asOfByKey = new Map(live.map((d) => [d.key, d.asOf]));
		const hits = rankByRecency(
			found.flatMap((h) =>
				h.key && asOfByKey.has(h.key) ? [{ ...h, asOf: asOfByKey.get(h.key) }] : [],
			),
			Date.now(),
		).slice(0, MAX_HITS);
		if (hits.length === 0) return "No matching records in the knowledge base.";
		return hits
			.map((h) => {
				const when = asOfLabel(h.asOf);
				return `### ${h.title} [${h.namespace}]${when ? ` (${when})` : ""}\n${h.text}`;
			})
			.join("\n\n---\n\n");
	},
});

function makeAgent(tier: Tier) {
	return new Agent(components.agent, {
		name: tier === "guest" ? "Terminal (guest)" : "Terminal (registered)",
		languageModel: convexGateway(MODELS[tier]),
		instructions: PLACEHOLDER_PERSONA,
		tools: { searchKnowledge },
		stopWhen: stepCountIs(4),
		callSettings: { maxOutputTokens: MAX_OUTPUT_TOKENS[tier] },
		// Bounded history keeps a turn's worst case inside TURN_RESERVE_USD.
		contextOptions: { recentMessages: tier === "guest" ? 20 : 16 },
		// Every step's cost counts against the monthly and daily AI budget.
		usageHandler: async (ctx, { model, usage, providerMetadata }) => {
			await ctx.runMutation(internal.billing.internal.record, {
				costUsd: costOf(
					model,
					usage as Parameters<typeof costOf>[1],
					providerMetadata as Parameters<typeof costOf>[2],
				),
			});
		},
	});
}

export const agents: Record<Tier, ReturnType<typeof makeAgent>> = {
	guest: makeAgent("guest"),
	registered: makeAgent("registered"),
};
