import { Agent } from "@convex-dev/agent";
import { gateway } from "ai";
import { components } from "../_generated/api";

/**
 * Default AI agent using Vercel AI Gateway.
 * Model format: provider/model-name (e.g. openai/gpt-4o-mini)
 */
export const supportAgent = new Agent(components.agent, {
	name: "Support Agent",
	languageModel: gateway("openai/gpt-4o-mini"),
	instructions: "You are a helpful assistant.",
	maxSteps: 3,
});
