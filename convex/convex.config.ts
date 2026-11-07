import agent from "@convex-dev/agent/convex.config";
import rag from "@convex-dev/rag/convex.config";
import rateLimiter from "@convex-dev/rate-limiter/convex.config";
import workOSAuthKit from "@convex-dev/workos-authkit/convex.config";
import { defineApp } from "convex/server";
import { v } from "convex/values";

/**
 * The environment the app reads. All optional: each is checked where it is
 * used, so a missing one never blocks a deploy.
 */
const app = defineApp({
	env: {
		/** WorkOS: the client the JWTs are issued for, and the site's organization. */
		WORKOS_CLIENT_ID: v.optional(v.string()),
		WORKOS_ORG_ID: v.optional(v.string()),
		/** Signs guest links. */
		GUEST_TOKEN_SECRET: v.optional(v.string()),
		/** GitHub sync: whose repositories, which organizations, and a token for rate limits. */
		GITHUB_USERNAME: v.optional(v.string()),
		GITHUB_ORGS: v.optional(v.string()),
		GITHUB_TOKEN: v.optional(v.string()),
		/** AI spend limits in USD; defaults apply when unset. */
		AI_MONTHLY_BUDGET_USD: v.optional(v.string()),
		AI_DAILY_BUDGET_USD: v.optional(v.string()),
	},
});
app.use(workOSAuthKit);
app.use(agent);
app.use(rag);
app.use(rateLimiter);
export default app;
