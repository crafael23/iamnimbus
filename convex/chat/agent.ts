import { Agent } from "@convex-dev/agent";
import { convexGateway } from "@convex-dev/ai-sdk-provider";
import { components } from "../_generated/api";

/**
 * Default AI agent using the Convex AI Gateway.
 * Convex authenticates gateway calls with a deployment token, so there is no
 * provider API key to store. Model format: provider/model-name.
 */
export const supportAgent = new Agent(components.agent, {
	name: "Support Agent",
	languageModel: convexGateway("anthropic/claude-haiku-4.5"),
	instructions: "You are a helpful assistant.",
	maxSteps: 3,
});
