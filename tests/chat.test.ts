import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../convex/_generated/api";
import { MODELS } from "../convex/chat/agent";
import { buildSystemPrompt, slashCommandInstruction, tierInstruction } from "../convex/_lib/persona";
import { PROFILE_LINKS } from "../convex/_lib/profile";
import {
	ACCESS_TTL_MS,
	hashNetwork,
	networkPrefix,
	readGuestCookie,
	signGuestAccess,
	signGuestCookie,
} from "../convex/_lib/guestToken";
import { asUser, GUEST_A, GUEST_B, scheduled, setup, type T, TEST_SECRET, tok } from "./setup";

// No network in tests: the judge refuses every message, so a scheduled turn
// ends at the visitor gate with a saved reply (and no model call).
vi.mock("../convex/_lib/safety", async (importOriginal) => ({
	...(await importOriginal<typeof import("../convex/_lib/safety")>()),
	checkContent: async () => ({ flagged: true, probability: 0.99, cost: 0 }),
}));

/** Finish the scheduled reply, so the thread accepts its next message. */
const settle = (t: T) => t.finishAllScheduledFunctions(vi.runAllTimers);

beforeEach(() => {
	// Freeze time so scheduled replies never run (no gateway calls) and the
	// token buckets do not refill mid-test.
	vi.useFakeTimers();
});
afterEach(() => {
	vi.useRealTimers();
});

const codeOf = async (p: Promise<unknown>) => {
	try {
		await p;
	} catch (e) {
		const data = (e as { data?: unknown }).data;
		if (data && typeof data === "object" && "code" in data) return (data as { code: string }).code;
		return String(e);
	}
	return "OK";
};

describe("tier and model routing", () => {
	test("models are fixed per tier", () => {
		expect(MODELS.guest).toBe("anthropic/claude-haiku-5.5");
		expect(MODELS.registered).toBe("anthropic/claude-sonnet-5.5");
	});

	test("an anonymous caller is routed as a guest", async () => {
		const t = setup();
		const { threadId } = await t.mutation(api.chat.mutations.startThread, { guestToken: await tok(GUEST_A) });
		const res = await t.mutation(api.chat.mutations.sendMessage, {
			threadId,
			prompt: "hello",
			guestToken: await tok(GUEST_A),
		});
		expect(res).toMatchObject({ tier: "guest", used: 1, limit: 10 });
		const jobs = await scheduled(t);
		expect(jobs.at(-1)?.name).toContain("generateResponse");
		expect(jobs.at(-1)?.args[0]).toMatchObject({ tier: "guest", used: 1, limit: 10 });
	});

	test("an authenticated caller is routed as registered, even if it sends a guest id", async () => {
		const t = setup();
		const user = await asUser(t, "user_reg");
		const { threadId } = await user.mutation(api.chat.mutations.startThread, { guestToken: await tok(GUEST_A) });
		const res = await user.mutation(api.chat.mutations.sendMessage, {
			threadId,
			prompt: "hello",
			guestToken: await tok(GUEST_A),
		});
		expect(res).toMatchObject({ tier: "registered", limit: 30 });
		const jobs = await scheduled(t);
		expect(jobs.at(-1)?.args[0]).toMatchObject({ tier: "registered" });
	});

	test("clients cannot pass a tier or model", async () => {
		const t = setup();
		const { threadId } = await t.mutation(api.chat.mutations.startThread, { guestToken: await tok(GUEST_A) });
		await expect(
			t.mutation(api.chat.mutations.sendMessage, {
				threadId,
				prompt: "hi",
				guestToken: await tok(GUEST_A),
				// @ts-expect-error not part of the API
				tier: "registered",
			}),
		).rejects.toThrow(/extra field|Validator/i);
	});

	test("a guest needs a token the server signed", async () => {
		const t = setup();
		const start = (guestToken?: string) =>
			codeOf(t.mutation(api.chat.mutations.startThread, { guestToken }));
		expect(await start()).toBe("NO_SESSION");
		expect(await start("not-a-token")).toBe("NO_SESSION");
		// Signed with another secret.
		const forged = await signGuestAccess("x".repeat(40), GUEST_A, "net-a", Date.now());
		expect(await start(forged.token)).toBe("NO_SESSION");
		// A valid token with its payload swapped for another guest's.
		const [, mac] = (await tok(GUEST_A)).split(".");
		const [body] = (await tok(GUEST_B)).split(".");
		expect(await start(`${body}.${mac}`)).toBe("NO_SESSION");
		// The long-lived cookie token is not an access token.
		expect(await start(await signGuestCookie(TEST_SECRET, GUEST_A, Date.now()))).toBe("NO_SESSION");
		expect(await start(await tok(GUEST_A))).toBe("OK");
	});

	test("an expired token can still read its thread, but cannot write", async () => {
		const t = setup();
		const token = await tok(GUEST_A);
		const { threadId } = await t.mutation(api.chat.mutations.startThread, { guestToken: token });
		vi.advanceTimersByTime(ACCESS_TTL_MS + 1000);
		const page = { numItems: 10, cursor: null };
		expect(
			await codeOf(t.query(api.chat.queries.listThreadMessages, { threadId, guestToken: token, paginationOpts: page })),
		).toBe("OK");
		expect(
			await codeOf(t.mutation(api.chat.mutations.sendMessage, { threadId, prompt: "x", guestToken: token })),
		).toBe("NO_SESSION");
		expect(
			await codeOf(t.mutation(api.chat.mutations.sendMessage, { threadId, prompt: "x", guestToken: await tok(GUEST_A) })),
		).toBe("OK");
	});
});

describe("guest identity", () => {
	test("the cookie token round-trips and rejects tampering or expiry", async () => {
		const now = Date.now();
		const cookie = await signGuestCookie(TEST_SECRET, GUEST_A, now);
		expect(await readGuestCookie(TEST_SECRET, cookie, now)).toBe(GUEST_A);
		expect(await readGuestCookie("y".repeat(40), cookie, now)).toBeNull();
		expect(await readGuestCookie(TEST_SECRET, `${cookie}x`, now)).toBeNull();
		expect(await readGuestCookie(TEST_SECRET, cookie, now + 31 * 24 * 3600 * 1000)).toBeNull();
	});

	test("addresses group by network: IPv4 /24, IPv6 /64", async () => {
		expect(networkPrefix("203.0.113.7")).toBe("203.0.113.0/24");
		expect(networkPrefix(" 203.0.113.200 ")).toBe("203.0.113.0/24");
		expect(networkPrefix("::ffff:203.0.113.9")).toBe("203.0.113.0/24");
		expect(networkPrefix("2001:db8:85a3:12::1")).toBe("2001:db8:85a3:12::/64");
		expect(networkPrefix("2001:0db8:85a3:0012:aaaa::9")).toBe("2001:db8:85a3:12::/64");
		expect(networkPrefix("2001:db8::1")).toBe("2001:db8:0:0::/64");
		expect(await hashNetwork(TEST_SECRET, "203.0.113.0/24")).toBe(
			await hashNetwork(TEST_SECRET, networkPrefix("203.0.113.99")),
		);
		expect(await hashNetwork(TEST_SECRET, "203.0.113.0/24")).not.toBe(
			await hashNetwork(TEST_SECRET, "203.0.114.0/24"),
		);
	});

	test("a new guest id on the same network shares the network's daily cap", async () => {
		const t = setup();
		// Three guests on one network (a visitor clearing cookies twice) use 30.
		const ids = [GUEST_A, GUEST_B, "cccccccc-3333-4333-8333-cccccccccccc"];
		for (const id of ids) {
			const { threadId } = await t.mutation(api.chat.mutations.startThread, { guestToken: await tok(id, "shared") });
			for (let i = 0; i < 10; i++) {
				await t.mutation(api.chat.mutations.sendMessage, { threadId, prompt: "x", guestToken: await tok(id, "shared") });
				await settle(t);
			}
		}
		const fresh = "dddddddd-4444-4444-8444-dddddddddddd";
		const { threadId } = await t.mutation(api.chat.mutations.startThread, { guestToken: await tok(fresh, "shared") });
		expect(
			await codeOf(t.mutation(api.chat.mutations.sendMessage, { threadId, prompt: "x", guestToken: await tok(fresh, "shared") })),
		).toBe("NETWORK_LIMIT");
		// The rejected message did not spend the new guest's own allowance.
		const status = await t.query(api.chat.queries.session, { guestToken: await tok(fresh, "shared") });
		expect(status?.used).toBe(0);
		// The same guest id on another network is not affected.
		const elsewhere = await t.mutation(api.chat.mutations.startThread, { guestToken: await tok(fresh, "other") });
		expect(
			await codeOf(
				t.mutation(api.chat.mutations.sendMessage, {
					threadId: elsewhere.threadId,
					prompt: "x",
					guestToken: await tok(fresh, "other"),
				}),
			),
		).toBe("OK");
	});
});

describe("message limits", () => {
	test("guests get 10 messages per session, then GUEST_LIMIT", async () => {
		const t = setup();
		const { threadId } = await t.mutation(api.chat.mutations.startThread, { guestToken: await tok(GUEST_A) });
		for (let i = 1; i <= 10; i++) {
			const res = await t.mutation(api.chat.mutations.sendMessage, {
				threadId,
				prompt: `m${i}`,
				guestToken: await tok(GUEST_A),
			});
			expect(res.used).toBe(i);
			await settle(t);
		}
		expect(
			await codeOf(
				t.mutation(api.chat.mutations.sendMessage, { threadId, prompt: "m11", guestToken: await tok(GUEST_A) }),
			),
		).toBe("GUEST_LIMIT");
		const status = await t.query(api.chat.queries.session, { guestToken: await tok(GUEST_A) });
		expect(status).toMatchObject({ tier: "guest", used: 10, remaining: 0 });

		// Another guest session is unaffected; a fresh thread does not reset the cap.
		const other = await t.mutation(api.chat.mutations.startThread, { guestToken: await tok(GUEST_B) });
		expect(
			await codeOf(
				t.mutation(api.chat.mutations.sendMessage, { threadId: other.threadId, prompt: "x", guestToken: await tok(GUEST_B) }),
			),
		).toBe("OK");
		const again = await t.mutation(api.chat.mutations.startThread, { guestToken: await tok(GUEST_A) });
		expect(
			await codeOf(
				t.mutation(api.chat.mutations.sendMessage, { threadId: again.threadId, prompt: "x", guestToken: await tok(GUEST_A) }),
			),
		).toBe("GUEST_LIMIT");
	});

	test("the 7th guest message carries the in-character notice; the 10th closes the session", async () => {
		const t = setup();
		const { threadId } = await t.mutation(api.chat.mutations.startThread, { guestToken: await tok(GUEST_A) });
		for (let i = 1; i <= 10; i++) {
			await t.mutation(api.chat.mutations.sendMessage, { threadId, prompt: `m${i}`, guestToken: await tok(GUEST_A) });
			await settle(t);
		}
		const jobs = (await scheduled(t)).filter((j) => j.name.includes("generateResponse"));
		const usedSeq = jobs.map((j) => (j.args[0] as { used: number }).used);
		expect(usedSeq).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
		expect(tierInstruction("guest", 7, 10, 7)).toMatch(/3 transmissions remain/);
		expect(tierInstruction("guest", 6, 10, 7)).not.toMatch(/remain/);
		expect(tierInstruction("guest", 10, 10, 7)).toMatch(/final message/);
	});

	test("registered users get 30 per rolling 24h, then DAILY_LIMIT", async () => {
		const t = setup();
		const user = await asUser(t, "user_heavy");
		const { threadId } = await user.mutation(api.chat.mutations.startThread, {});
		for (let i = 1; i <= 30; i++) {
			await user.mutation(api.chat.mutations.sendMessage, { threadId, prompt: `m${i}` });
			await settle(t);
		}
		expect(await codeOf(user.mutation(api.chat.mutations.sendMessage, { threadId, prompt: "m31" }))).toBe(
			"DAILY_LIMIT",
		);
		// Rolling window: after ~48 minutes one message has refilled.
		vi.advanceTimersByTime(49 * 60 * 1000);
		expect(await codeOf(user.mutation(api.chat.mutations.sendMessage, { threadId, prompt: "later" }))).toBe("OK");
	});

	test("a thread takes one turn at a time; a stuck turn unblocks after two minutes", async () => {
		const t = setup();
		const { threadId } = await t.mutation(api.chat.mutations.startThread, { guestToken: await tok(GUEST_A) });
		await t.mutation(api.chat.mutations.sendMessage, { threadId, prompt: "first", guestToken: await tok(GUEST_A) });
		expect(
			await codeOf(t.mutation(api.chat.mutations.sendMessage, { threadId, prompt: "second", guestToken: await tok(GUEST_A) })),
		).toBe("BUSY");
		// The reply job stalls (cancelled here so the clock does not run it).
		const stalled = (await scheduled(t)).find((j) => j.name.includes("generateResponse"));
		await t.run((ctx) => ctx.scheduler.cancel(stalled!._id));
		vi.advanceTimersByTime(2 * 60 * 1000 + 1);
		expect(
			await codeOf(t.mutation(api.chat.mutations.sendMessage, { threadId, prompt: "second", guestToken: await tok(GUEST_A) })),
		).toBe("OK");
		// The abandoned, never-judged prompt is fenced out of history.
		const { page } = await t.query(api.chat.queries.listThreadMessages, {
			threadId,
			guestToken: await tok(GUEST_A),
			paginationOpts: { numItems: 10, cursor: null },
		});
		expect(page.map((m) => m.text)).toEqual(["[not sent: the safety check did not finish]", "second"]);
	});

	test("a rejected guest message does not consume the session's allowance", async () => {
		const t = setup();
		const { threadId } = await t.mutation(api.chat.mutations.startThread, { guestToken: await tok(GUEST_A) });
		expect(
			await codeOf(
				t.mutation(api.chat.mutations.sendMessage, { threadId, prompt: "x".repeat(2001), guestToken: await tok(GUEST_A) }),
			),
		).toBe("TOO_LONG");
		const status = await t.query(api.chat.queries.session, { guestToken: await tok(GUEST_A) });
		expect(status?.used).toBe(0);
	});
});

describe("thread ownership", () => {
	test("another guest session cannot read or write a guest thread", async () => {
		const t = setup();
		const { threadId } = await t.mutation(api.chat.mutations.startThread, { guestToken: await tok(GUEST_A) });
		await t.mutation(api.chat.mutations.sendMessage, { threadId, prompt: "secret", guestToken: await tok(GUEST_A) });

		const page = { numItems: 10, cursor: null };
		const own = await t.query(api.chat.queries.listThreadMessages, {
			threadId,
			guestToken: await tok(GUEST_A),
			paginationOpts: page,
		});
		expect(own.page.map((m) => m.text)).toContain("secret");

		expect(
			await codeOf(
				t.query(api.chat.queries.listThreadMessages, { threadId, guestToken: await tok(GUEST_B), paginationOpts: page }),
			),
		).toBe("FORBIDDEN");
		expect(
			await codeOf(
				t.mutation(api.chat.mutations.sendMessage, { threadId, prompt: "hijack", guestToken: await tok(GUEST_B) }),
			),
		).toBe("FORBIDDEN");
	});

	test("users cannot read each other's threads, and guests cannot read a user's", async () => {
		const t = setup();
		const alice = await asUser(t, "user_alice");
		const bob = await asUser(t, "user_bob");
		const { threadId } = await alice.mutation(api.chat.mutations.startThread, {});
		const page = { numItems: 10, cursor: null };
		expect(await codeOf(alice.query(api.chat.queries.listThreadMessages, { threadId, paginationOpts: page }))).toBe(
			"OK",
		);
		expect(await codeOf(bob.query(api.chat.queries.listThreadMessages, { threadId, paginationOpts: page }))).toBe(
			"FORBIDDEN",
		);
		expect(
			await codeOf(
				t.query(api.chat.queries.listThreadMessages, { threadId, guestToken: await tok(GUEST_A), paginationOpts: page }),
			),
		).toBe("FORBIDDEN");
		expect(await codeOf(bob.mutation(api.chat.mutations.sendMessage, { threadId, prompt: "x" }))).toBe("FORBIDDEN");
	});

	test("unknown or malformed thread ids are forbidden, not leaked", async () => {
		const t = setup();
		const page = { numItems: 10, cursor: null };
		expect(
			await codeOf(
				t.query(api.chat.queries.listThreadMessages, {
					threadId: "nonsense",
					guestToken: await tok(GUEST_A),
					paginationOpts: page,
				}),
			),
		).toBe("FORBIDDEN");
	});

	test("a registered user's thread persists: startThread returns the same thread", async () => {
		const t = setup();
		const alice = await asUser(t, "user_alice");
		const first = await alice.mutation(api.chat.mutations.startThread, {});
		const second = await alice.mutation(api.chat.mutations.startThread, {});
		expect(second.threadId).toBe(first.threadId);
	});

	test("a guest can resume only its own thread", async () => {
		const t = setup();
		const a = await t.mutation(api.chat.mutations.startThread, { guestToken: await tok(GUEST_A) });
		const resumed = await t.mutation(api.chat.mutations.startThread, { guestToken: await tok(GUEST_A), resume: a.threadId });
		expect(resumed.threadId).toBe(a.threadId);
		const stolen = await t.mutation(api.chat.mutations.startThread, { guestToken: await tok(GUEST_B), resume: a.threadId });
		expect(stolen.threadId).not.toBe(a.threadId);
	});
});

describe("prompt assembly", () => {
	test("slash commands become structured instructions; unknown ones do not", () => {
		expect(slashCommandInstruction("/projects")).toMatch(/projects/);
		expect(slashCommandInstruction("  /RESUME please")).toMatch(/résumé/);
		expect(slashCommandInstruction("/rm -rf")).toBeNull();
		expect(slashCommandInstruction("tell me about projects")).toBeNull();
	});

	test("the system prompt layers persona, rules and the turn", () => {
		const system = buildSystemPrompt({
			persona: "PERSONA",
			tier: "guest",
			used: 7,
			limit: 10,
			noticeAt: 7,
			prompt: "/about",
		});
		expect(system.startsWith("PERSONA")).toBe(true);
		expect(system).toMatch(/searchKnowledge/);
		expect(system).toMatch(/3 transmissions remain/);
		expect(system).toMatch(/ran \/about/);
	});

	test("every turn carries the owner's public profiles; /contact asks for them", () => {
		const system = buildSystemPrompt({
			persona: "PERSONA",
			tier: "guest",
			used: 1,
			limit: 10,
			noticeAt: 7,
			prompt: "hello",
		});
		for (const link of PROFILE_LINKS) expect(system).toContain(link.href);
		expect(slashCommandInstruction("/contact")).toMatch(/public profiles/);
	});
});
