import { Agent, createTool, stepCountIs } from "@convex-dev/agent";
import { convexGateway } from "@convex-dev/ai-sdk-provider";
import { z } from "zod";
import { components } from "../_generated/api";
import { PLACEHOLDER_PERSONA, type Tier } from "../_lib/persona";
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

const searchKnowledge = createTool({
	description:
		"Search the portfolio owner's knowledge base for facts about their projects, history, skills, goals, published writing and GitHub repositories. Use it only when the visitor asks something specific that these records can answer.",
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
	execute: async (ctx, { query, namespace }) => {
		const hits = await searchKnowledgeBase(ctx, { query, namespace });
		if (hits.length === 0) return "No matching records in the knowledge base.";
		return hits
			.map((h) => `### ${h.title} [${h.namespace}]\n${h.text}`)
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
		contextOptions: { recentMessages: tier === "guest" ? 20 : 40 },
	});
}

export const agents: Record<Tier, ReturnType<typeof makeAgent>> = {
	guest: makeAgent("guest"),
	registered: makeAgent("registered"),
};
