import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "../convex/_generated/api";
import { asUser, GUEST_A, setup, tok } from "./setup";
vi.mock("../convex/_lib/safety", async (original) => ({
	...(await original<typeof import("../convex/_lib/safety")>()),
	checkContent: async () => ({ flagged: true, probability: 1, cost: 0 }),
}));
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
test("new sessions and successful messages are counted by server tier, resumes are excluded", async () => {
	const t = setup();
	const token = await tok(GUEST_A);
	const guest = await t.mutation(api.chat.mutations.startThread, { guestToken: token });
	await t.mutation(api.chat.mutations.startThread, { guestToken: token, resume: guest.threadId });
	await t.mutation(api.chat.mutations.sendMessage, {
		guestToken: token,
		threadId: guest.threadId,
		prompt: "hi",
	});
	const user = await asUser(t, "member");
	const registered = await user.mutation(api.chat.mutations.startThread, {});
	await user.mutation(api.chat.mutations.startThread, {});
	await user.mutation(api.chat.mutations.sendMessage, {
		threadId: registered.threadId,
		prompt: "hi",
	});
	const admin = await asUser(t, "admin", "admin");
	const result = await admin.query(api.analytics.queries.summary, { days: 7 });
	expect(result.sessions).toEqual({ guest: 1, registered: 1 });
	expect(result.messages).toEqual({ guest: 1, registered: 1 });
	await expect(user.query(api.analytics.queries.summary, { days: 7 })).rejects.toThrow("Admin");
	await expect(t.query(api.analytics.queries.summary, { days: 30 })).rejects.toThrow(
		"authenticated",
	);
});
test("conversion verifies tokens, derives gate status, and records once per user", async () => {
	const t = setup();
	const token = await tok(GUEST_A);
	const { threadId } = await t.mutation(api.chat.mutations.startThread, { guestToken: token });
	const user = await asUser(t, "convert");
	await user.mutation(api.analytics.mutations.convertGuest, { guestToken: "forged" });
	expect(await t.run((ctx) => ctx.db.query("analyticsEvents").collect())).toHaveLength(1);
	for (let i = 0; i < 10; i++) {
		await t.mutation(api.chat.mutations.sendMessage, {
			guestToken: token,
			threadId,
			prompt: "hello",
		});
		await t.finishAllScheduledFunctions(vi.runAllTimers);
	}
	await user.mutation(api.analytics.mutations.convertGuest, { guestToken: token });
	await user.mutation(api.analytics.mutations.convertGuest, { guestToken: token });
	const admin = await asUser(t, "admin", "admin");
	expect(await admin.query(api.analytics.queries.summary, { days: 30 })).toMatchObject({
		conversions: 1,
		atGate: 1,
		reachedLimit: 1,
	});
});
test("summary excludes older events and aggregates topics", async () => {
	const t = setup();
	const admin = await asUser(t, "admin", "admin");
	await t.run(async (ctx) => {
		await ctx.db.insert("analyticsEvents", {
			day: new Date().toISOString().slice(0, 10),
			kind: "topic",
			topic: "projects",
		});
		await ctx.db.insert("analyticsEvents", { day: "2000-01-01", kind: "session", tier: "guest" });
	});
	const result = await admin.query(api.analytics.queries.summary, { days: 7 });
	expect(result.sessions.guest).toBe(0);
	expect(result.topics.find((t) => t.topic === "projects")?.count).toBe(1);
});
