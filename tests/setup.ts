import agent from "@convex-dev/agent/test";
import rag from "@convex-dev/rag/test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { signGuestAccess } from "../convex/_lib/guestToken";
import schema from "../convex/schema";

export const TEST_SECRET = "test-guest-token-secret-0123456789abcdef";
process.env.GUEST_TOKEN_SECRET = TEST_SECRET;

export const modules = import.meta.glob(["../convex/**/*.ts", "../convex/**/*.js", "!../convex/**/*.d.ts"]);

export function setup() {
	const t = convexTest(schema, modules);
	agent.register(t, "agent");
	rag.register(t, "rag");
	rateLimiter.register(t, "rateLimiter");
	return t;
}

export type T = ReturnType<typeof setup>;

export const GUEST_A = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
export const GUEST_B = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";

/**
 * A guest access token as /api/guest would issue it now. Each guest gets its
 * own network unless one is named.
 */
export async function tok(sub: string, net = `net-${sub.slice(0, 8)}`) {
	return (await signGuestAccess(TEST_SECRET, sub, net, Date.now())).token;
}

/** Insert a synced user row and return an identity-scoped client. */
export async function asUser(t: T, subject: string, role?: string) {
	await t.run(async (ctx) => {
		await ctx.db.insert("users", {
			authId: subject,
			tokenIdentifier: subject,
			name: subject,
			email: `${subject}@example.test`,
			role,
			createdAt: Date.now(),
		});
	});
	return t.withIdentity({ subject, issuer: "https://api.workos.com/" });
}

export async function scheduled(t: T) {
	return await t.run(async (ctx) => ctx.db.system.query("_scheduled_functions").collect());
}
