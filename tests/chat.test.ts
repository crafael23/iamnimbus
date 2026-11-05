import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../convex/_generated/api";
import { MODELS } from "../convex/chat/agent";
import { buildSystemPrompt, slashCommandInstruction, tierInstruction } from "../convex/_lib/persona";
import { asUser, GUEST_A, GUEST_B, scheduled, setup } from "./setup";

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
		const { threadId } = await t.mutation(api.chat.mutations.startThread, { guestSessionId: GUEST_A });
		const res = await t.mutation(api.chat.mutations.sendMessage, {
			threadId,
			prompt: "hello",
			guestSessionId: GUEST_A,
		});
		expect(res).toMatchObject({ tier: "guest", used: 1, limit: 10 });
		const jobs = await scheduled(t);
		expect(jobs.at(-1)?.name).toContain("generateResponse");
		expect(jobs.at(-1)?.args[0]).toMatchObject({ tier: "guest", used: 1, limit: 10 });
	});

	test("an authenticated caller is routed as registered, even if it sends a guest id", async () => {
		const t = setup();
		const user = await asUser(t, "user_reg");
		const { threadId } = await user.mutation(api.chat.mutations.startThread, { guestSessionId: GUEST_A });
		const res = await user.mutation(api.chat.mutations.sendMessage, {
			threadId,
			prompt: "hello",
			guestSessionId: GUEST_A,
		});
		expect(res).toMatchObject({ tier: "registered", limit: 30 });
		const jobs = await scheduled(t);
		expect(jobs.at(-1)?.args[0]).toMatchObject({ tier: "registered" });
	});

	test("clients cannot pass a tier or model", async () => {
		const t = setup();
		const { threadId } = await t.mutation(api.chat.mutations.startThread, { guestSessionId: GUEST_A });
		await expect(
			t.mutation(api.chat.mutations.sendMessage, {
				threadId,
				prompt: "hi",
				guestSessionId: GUEST_A,
				// @ts-expect-error not part of the API
				tier: "registered",
			}),
		).rejects.toThrow(/extra field|Validator/i);
	});

	test("a guest needs a well-formed session id", async () => {
		const t = setup();
		expect(await codeOf(t.mutation(api.chat.mutations.startThread, {}))).toBe("NO_SESSION");
		expect(
			await codeOf(t.mutation(api.chat.mutations.startThread, { guestSessionId: "not-a-uuid" })),
		).toBe("NO_SESSION");
	});
});

describe("message limits", () => {
	test("guests get 10 messages per session, then GUEST_LIMIT", async () => {
		const t = setup();
		const { threadId } = await t.mutation(api.chat.mutations.startThread, { guestSessionId: GUEST_A });
		for (let i = 1; i <= 10; i++) {
			const res = await t.mutation(api.chat.mutations.sendMessage, {
				threadId,
				prompt: `m${i}`,
				guestSessionId: GUEST_A,
			});
			expect(res.used).toBe(i);
		}
		expect(
			await codeOf(
				t.mutation(api.chat.mutations.sendMessage, { threadId, prompt: "m11", guestSessionId: GUEST_A }),
			),
		).toBe("GUEST_LIMIT");
		const status = await t.query(api.chat.queries.session, { guestSessionId: GUEST_A });
		expect(status).toMatchObject({ tier: "guest", used: 10, remaining: 0 });

		// Another guest session is unaffected; a fresh thread does not reset the cap.
		const other = await t.mutation(api.chat.mutations.startThread, { guestSessionId: GUEST_B });
		expect(
			await codeOf(
				t.mutation(api.chat.mutations.sendMessage, { threadId: other.threadId, prompt: "x", guestSessionId: GUEST_B }),
			),
		).toBe("OK");
		const again = await t.mutation(api.chat.mutations.startThread, { guestSessionId: GUEST_A });
		expect(
			await codeOf(
				t.mutation(api.chat.mutations.sendMessage, { threadId: again.threadId, prompt: "x", guestSessionId: GUEST_A }),
			),
		).toBe("GUEST_LIMIT");
	});

	test("the 7th guest message carries the in-character notice; the 10th closes the session", async () => {
		const t = setup();
		const { threadId } = await t.mutation(api.chat.mutations.startThread, { guestSessionId: GUEST_A });
		for (let i = 1; i <= 10; i++) {
			await t.mutation(api.chat.mutations.sendMessage, { threadId, prompt: `m${i}`, guestSessionId: GUEST_A });
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
		}
		expect(await codeOf(user.mutation(api.chat.mutations.sendMessage, { threadId, prompt: "m31" }))).toBe(
			"DAILY_LIMIT",
		);
		// Rolling window: after ~48 minutes one message has refilled.
		vi.advanceTimersByTime(49 * 60 * 1000);
		expect(await codeOf(user.mutation(api.chat.mutations.sendMessage, { threadId, prompt: "later" }))).toBe("OK");
	});

	test("a rejected guest message does not consume the session's allowance", async () => {
		const t = setup();
		const { threadId } = await t.mutation(api.chat.mutations.startThread, { guestSessionId: GUEST_A });
		expect(
			await codeOf(
				t.mutation(api.chat.mutations.sendMessage, { threadId, prompt: "x".repeat(2001), guestSessionId: GUEST_A }),
			),
		).toBe("TOO_LONG");
		const status = await t.query(api.chat.queries.session, { guestSessionId: GUEST_A });
		expect(status?.used).toBe(0);
	});
});

describe("thread ownership", () => {
	test("another guest session cannot read or write a guest thread", async () => {
		const t = setup();
		const { threadId } = await t.mutation(api.chat.mutations.startThread, { guestSessionId: GUEST_A });
		await t.mutation(api.chat.mutations.sendMessage, { threadId, prompt: "secret", guestSessionId: GUEST_A });

		const page = { numItems: 10, cursor: null };
		const own = await t.query(api.chat.queries.listThreadMessages, {
			threadId,
			guestSessionId: GUEST_A,
			paginationOpts: page,
		});
		expect(own.page.map((m) => m.text)).toContain("secret");

		expect(
			await codeOf(
				t.query(api.chat.queries.listThreadMessages, { threadId, guestSessionId: GUEST_B, paginationOpts: page }),
			),
		).toBe("FORBIDDEN");
		expect(
			await codeOf(
				t.mutation(api.chat.mutations.sendMessage, { threadId, prompt: "hijack", guestSessionId: GUEST_B }),
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
				t.query(api.chat.queries.listThreadMessages, { threadId, guestSessionId: GUEST_A, paginationOpts: page }),
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
					guestSessionId: GUEST_A,
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
		const a = await t.mutation(api.chat.mutations.startThread, { guestSessionId: GUEST_A });
		const resumed = await t.mutation(api.chat.mutations.startThread, { guestSessionId: GUEST_A, resume: a.threadId });
		expect(resumed.threadId).toBe(a.threadId);
		const stolen = await t.mutation(api.chat.mutations.startThread, { guestSessionId: GUEST_B, resume: a.threadId });
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
});
