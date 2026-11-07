import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import {
	createGame,
	type Dir,
	encodeInput,
	type Layout,
	MAX_INPUTS,
	MAX_TICKS,
	READY_TICKS,
	replay,
	step,
	TICK_HZ,
} from "../convex/_lib/arcade/engine";
import { INITIALS_LENGTH, normalizeInitials } from "../convex/_lib/arcade/initials";
import { arcadeScores } from "../convex/_lib/arcade/leaderboard";
import { asUser, GUEST_A, GUEST_B, setup, tok, type T } from "./setup";

beforeEach(() => {
	vi.useFakeTimers();
});
afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
});

function bytes(inputs: number[]): ArrayBuffer {
	const buffer = new ArrayBuffer(inputs.length * 4);
	const view = new DataView(buffer);
	inputs.forEach((input, i) => view.setUint32(i * 4, input, true));
	return buffer;
}

/** Play whole rounds with one chosen heading, recording inputs before stepping. */
function play(seed: number, layout: Layout = "wide", heading: Dir = 0) {
	const game = createGame(seed, layout);
	const inputs: number[] = [];
	while (game.phase !== "over" && game.tick < MAX_TICKS + 100) {
		const frame = game.phase === "ready" && game.tick === game.phaseEnds - READY_TICKS ? [heading] : [];
		for (const code of frame) inputs.push(encodeInput(game.tick, code));
		step(game, frame);
	}
	expect(game.phase).toBe("over");
	const result = replay(seed, layout, inputs);
	expect(result).toEqual({ ok: true, score: game.score, level: game.level, ticks: game.tick });
	return { inputs: bytes(inputs), score: game.score, level: game.level, ticks: game.tick };
}

type Client = ReturnType<T["withIdentity"]>;

const settle = (t: Client) => t.finishAllScheduledFunctions(vi.runAllTimers);

async function submit(
	t: Client,
	runId: Id<"arcadeRuns">,
	game: ReturnType<typeof play>,
	guestToken?: string,
	initials = "ABC",
) {
	vi.setSystemTime(Date.now() + Math.ceil((game.ticks * 1000) / TICK_HZ));
	expect(
		await t.mutation(api.arcade.mutations.submitRun, { runId, inputs: game.inputs, initials, guestToken }),
	).toBeNull();
	await settle(t);
	return t.query(api.arcade.queries.runStatus, { runId, guestToken });
}

describe("arcade verification", () => {
	test.each(["wide", "tall"] as const)("a played %s game becomes a replay-scored leaderboard entry", async (layout) => {
		const t = setup();
		const guestToken = await tok(GUEST_A);
		const { runId, seed } = await t.mutation(api.arcade.mutations.startRun, { guestToken, layout });
		expect(Number.isInteger(seed)).toBe(true);
		expect(seed).toBeGreaterThanOrEqual(-0x80000000);
		expect(seed).toBeLessThanOrEqual(0x7fffffff);
		expect(await t.query(api.arcade.queries.runStatus, { runId, guestToken })).toMatchObject({ status: "open" });
		const game = play(seed, layout);
		expect(game.score).toBeGreaterThan(0);
		expect(await submit(t, runId, game, guestToken, " a1z ")).toMatchObject({
			status: "verified",
			score: game.score,
			level: game.level,
			rank: 1,
			total: 1,
			personalBest: true,
		});
		expect(await t.query(api.arcade.queries.leaderboard, { guestToken })).toEqual({
			top: [{ initials: "A1Z", score: game.score, level: game.level, mine: true }],
			total: 1,
		});
		expect(await t.query(api.arcade.queries.myBest, { guestToken })).toEqual({
			initials: "A1Z",
			score: game.score,
			level: game.level,
			rank: 1,
		});
		const run = await t.run((ctx) => ctx.db.get("arcadeRuns", runId));
		expect(run?.inputs).toBeUndefined();
		expect(run?.ticks).toBe(game.ticks);
		expect(run?.network).toBeDefined();
	});

	test("a valid replay submitted impossibly soon is rejected", async () => {
		const t = setup();
		const guestToken = await tok(GUEST_A);
		const { runId, seed } = await t.mutation(api.arcade.mutations.startRun, { guestToken, layout: "wide" });
		await t.mutation(api.arcade.mutations.submitRun, { runId, inputs: play(seed).inputs, initials: "ABC", guestToken });
		await settle(t);
		expect(await t.query(api.arcade.queries.runStatus, { runId, guestToken })).toMatchObject({
			status: "rejected",
			reason: "too-fast",
		});
		expect((await t.run((ctx) => ctx.db.get("arcadeRuns", runId)))?.inputs).toBeUndefined();
		expect(await t.query(api.arcade.queries.leaderboard, {})).toEqual({ top: [], total: 0 });
	});

	test.each([{ inputs: [7] }, { inputs: [0xffffffff] }, { inputs: [80, 0] }])(
		"garbage inputs $inputs never reach the leaderboard",
		async ({ inputs }) => {
			const t = setup();
			const guestToken = await tok(GUEST_A);
			const { runId } = await t.mutation(api.arcade.mutations.startRun, { guestToken, layout: "wide" });
			vi.setSystemTime(Date.now() + 60_000);
			await t.mutation(api.arcade.mutations.submitRun, { runId, inputs: bytes(inputs), initials: "ABC", guestToken });
			await settle(t);
			expect(await t.query(api.arcade.queries.runStatus, { runId, guestToken })).toMatchObject({
				status: "rejected",
				reason: "bad-input",
			});
			expect(await t.query(api.arcade.queries.myBest, { guestToken })).toBeNull();
		},
	);

	test("ownership gates submission and private reads", async () => {
		const t = setup();
		const a = await tok(GUEST_A);
		const b = await tok(GUEST_B);
		const { runId } = await t.mutation(api.arcade.mutations.startRun, { guestToken: a, layout: "wide" });
		await expect(
			t.mutation(api.arcade.mutations.submitRun, { runId, inputs: bytes([]), initials: "ABC", guestToken: b }),
		).rejects.toThrow(/FORBIDDEN/);
		expect(await t.query(api.arcade.queries.runStatus, { runId, guestToken: b })).toBeNull();
		expect(await t.query(api.arcade.queries.runStatus, { runId })).toBeNull();
		expect(await t.query(api.arcade.queries.runStatus, { runId, guestToken: "bad" })).toBeNull();
		expect(await t.query(api.arcade.queries.myBest, { guestToken: b })).toBeNull();
		expect(await t.query(api.arcade.queries.myBest, {})).toBeNull();
		expect(await t.query(api.arcade.queries.myBest, { guestToken: "bad" })).toBeNull();
	});

	test("double submits fail while verifying and after completion, and results are idempotent", async () => {
		const t = setup();
		const guestToken = await tok(GUEST_A);
		const { runId, seed } = await t.mutation(api.arcade.mutations.startRun, { guestToken, layout: "wide" });
		const game = play(seed);
		vi.setSystemTime(Date.now() + 60_000);
		const args = { runId, inputs: game.inputs, initials: "ABC", guestToken };
		await t.mutation(api.arcade.mutations.submitRun, args);
		expect(await t.query(api.arcade.queries.runStatus, { runId, guestToken })).toMatchObject({ status: "verifying" });
		await expect(t.mutation(api.arcade.mutations.submitRun, args)).rejects.toThrow(/BAD_RUN/);
		await settle(t);
		const before = await t.run((ctx) => ctx.db.get("arcadeRuns", runId));
		await expect(t.mutation(api.arcade.mutations.submitRun, args)).rejects.toThrow(/BAD_RUN/);
		await t.mutation(internal.arcade.internal.recordResult, {
			runId,
			result: { ok: true, score: game.score + 1000, level: 99, ticks: 1 },
		});
		await t.mutation(internal.arcade.internal.recordResult, { runId, result: { ok: false, reason: "duplicate" } });
		await t.action(internal.arcade.internal.verifyRun, { runId });
		expect(await t.run((ctx) => ctx.db.get("arcadeRuns", runId))).toEqual(before);
		expect((await t.query(api.arcade.queries.leaderboard, {})).total).toBe(1);
	});

	test("lower and equal scores preserve the best; a higher score replaces it without adding an owner", async () => {
		const t = setup();
		const guestToken = await tok(GUEST_A);
		const games = ([0, 1, 2, 3] as const).map((heading) => play(7, "wide", heading)).sort((a, b) => a.score - b.score);
		const low = games[0]!;
		const middle = games.find((game) => game.score > low.score)!;
		const high = games.at(-1)!;
		expect(middle).toBeDefined();
		expect(high.score).toBeGreaterThan(middle.score);
		for (const [game, initials, personalBest] of [
			[middle, "MID", true],
			[low, "LOW", false],
			[middle, "EQL", false],
			[high, "TOP", true],
		] as const) {
			const { runId } = await t.mutation(api.arcade.mutations.startRun, { guestToken, layout: "wide" });
			// Fix the fixture seed so all four policies play the same board.
			await t.run((ctx) => ctx.db.patch("arcadeRuns", runId, { seed: 7 }));
			expect(await submit(t, runId, game, guestToken, initials)).toMatchObject({
				status: "verified",
				score: game.score,
				personalBest,
				total: 1,
				rank: game.score < middle.score ? 2 : 1,
			});
			const best = await t.query(api.arcade.queries.myBest, { guestToken });
			expect(best).toMatchObject({
				initials: personalBest ? initials : "MID",
				score: personalBest ? game.score : middle.score,
				rank: 1,
			});
		}
		expect(await t.run((ctx) => ctx.db.query("arcadeScores").collect())).toHaveLength(1);
	});

	test("registered users submit without a guest token and identity overrides a supplied guest", async () => {
		const t = setup();
		const user = await asUser(t, "arcade-user");
		const { runId, seed } = await user.mutation(api.arcade.mutations.startRun, {
			layout: "wide",
			guestToken: await tok(GUEST_A),
		});
		const game = play(seed);
		expect(await submit(user, runId, game)).toMatchObject({ status: "verified", personalBest: true });
		expect(await user.query(api.arcade.queries.myBest, {})).toMatchObject({ score: game.score, rank: 1 });
		const run = await t.run((ctx) => ctx.db.get("arcadeRuns", runId));
		expect(run?.ownerId).toBe("user:arcade-user");
		expect(run?.network).toBeUndefined();
		expect((await t.query(api.arcade.queries.leaderboard, { guestToken: await tok(GUEST_A) })).top[0]?.mine).toBe(
			false,
		);
	});

	test("public leaderboard is sorted, limited to ten, counts owners, and shares ranks for ties", async () => {
		const t = setup();
		await t.run(async (ctx) => {
			for (let i = 0; i < 12; i++) {
				const id = await ctx.db.insert("arcadeScores", {
					ownerId: `guest:${i === 10 ? GUEST_A : i}`,
					initials: `A${i.toString().padStart(2, "0")}`,
					score: i === 11 ? 100 : i * 10,
					level: 1,
					achievedAt: Date.now(),
				});
				await arcadeScores.insert(ctx, (await ctx.db.get("arcadeScores", id))!);
			}
		});
		for (const guestToken of [undefined, "bad"]) {
			const board = await t.query(api.arcade.queries.leaderboard, { guestToken });
			expect(board.total).toBe(12);
			expect(board.top).toHaveLength(10);
			expect(board.top.map((row) => row.score)).toEqual([100, 100, 90, 80, 70, 60, 50, 40, 30, 20]);
			expect(board.top.every((row) => !row.mine)).toBe(true);
		}
		expect(await t.query(api.arcade.queries.myBest, { guestToken: await tok(GUEST_A) })).toMatchObject({ rank: 1 });
	});
});

describe("arcade validation and limits", () => {
	test.each([
		"ASS",
		"CUM",
		"FAG",
		"FUC",
		"FUK",
		"FCK",
		"KKK",
		"NIG",
		"NGR",
		"TIT",
		"DIK",
		"DIC",
		"COK",
		"CUN",
		"KYS",
		"SHT",
		"",
		"AB",
		"ABCD",
		"A B",
		"A!B",
		"éAB",
	])("invalid initials %j leave the run open", async (initials) => {
		const t = setup();
		const guestToken = await tok(GUEST_A);
		const { runId } = await t.mutation(api.arcade.mutations.startRun, { guestToken, layout: "wide" });
		await expect(
			t.mutation(api.arcade.mutations.submitRun, {
				runId,
				inputs: bytes([]),
				initials: initials.toLowerCase(),
				guestToken,
			}),
		).rejects.toThrow(/BAD_INITIALS/);
		expect(await t.query(api.arcade.queries.runStatus, { runId, guestToken })).toMatchObject({ status: "open" });
	});

	test("initials normalization is shared and purely validates three ASCII letters or digits", () => {
		expect(INITIALS_LENGTH).toBe(3);
		expect(normalizeInitials(" a1z ")).toBe("A1Z");
		expect(normalizeInitials(" fck ")).toBeNull();
	});

	test.each([1, MAX_INPUTS * 4 + 4])("invalid input byte length %i leaves the run open", async (length) => {
		const t = setup();
		const guestToken = await tok(GUEST_A);
		const { runId } = await t.mutation(api.arcade.mutations.startRun, { guestToken, layout: "wide" });
		await expect(
			t.mutation(api.arcade.mutations.submitRun, {
				runId,
				inputs: new ArrayBuffer(length),
				initials: "ABC",
				guestToken,
			}),
		).rejects.toThrow(/BAD_RUN/);
		expect(await t.query(api.arcade.queries.runStatus, { runId, guestToken })).toMatchObject({ status: "open" });
	});

	test("starting a new run removes only this owner's prior open run", async () => {
		const t = setup();
		const guestToken = await tok(GUEST_A);
		const a = await t.mutation(api.arcade.mutations.startRun, { guestToken, layout: "wide" });
		const b = await t.mutation(api.arcade.mutations.startRun, { guestToken: await tok(GUEST_B), layout: "tall" });
		const next = await t.mutation(api.arcade.mutations.startRun, { guestToken, layout: "tall" });
		expect(await t.query(api.arcade.queries.runStatus, { runId: a.runId, guestToken })).toBeNull();
		const runs = await t.run((ctx) => ctx.db.query("arcadeRuns").collect());
		expect(runs.map((run) => run._id).sort()).toEqual([b.runId, next.runId].sort());
		await expect(
			t.mutation(api.arcade.mutations.submitRun, { runId: a.runId, inputs: bytes([]), initials: "ABC", guestToken }),
		).rejects.toThrow(/FORBIDDEN/);
	});

	test("start requires a current session", async () => {
		const t = setup();
		await expect(t.mutation(api.arcade.mutations.startRun, { layout: "wide" })).rejects.toThrow(/NO_SESSION/);
	});

	test("the owner bucket trips after its twenty-run burst", async () => {
		const t = setup();
		const guestToken = await tok(GUEST_A);
		for (let i = 0; i < 20; i++) await t.mutation(api.arcade.mutations.startRun, { guestToken, layout: "wide" });
		await expect(t.mutation(api.arcade.mutations.startRun, { guestToken, layout: "wide" })).rejects.toThrow(
			/RATE_LIMITED/,
		);
		vi.setSystemTime(Date.now() + 60_000);
		await expect(t.mutation(api.arcade.mutations.startRun, { guestToken, layout: "wide" })).resolves.toHaveProperty(
			"runId",
		);
	});

	test("guests share the network burst and a rejected start rolls back the owner token", async () => {
		const t = setup();
		for (const guest of [GUEST_A, GUEST_B, "cccccccc-3333-4333-8333-cccccccccccc"]) {
			const guestToken = await tok(guest, "shared");
			for (let i = 0; i < 20; i++) await t.mutation(api.arcade.mutations.startRun, { guestToken, layout: "wide" });
		}
		const fourth = "dddddddd-4444-4444-8444-dddddddddddd";
		await expect(
			t.mutation(api.arcade.mutations.startRun, { guestToken: await tok(fourth, "shared"), layout: "wide" }),
		).rejects.toThrow(/RATE_LIMITED/);
		const guestToken = await tok(fourth, "different");
		for (let i = 0; i < 20; i++) await t.mutation(api.arcade.mutations.startRun, { guestToken, layout: "wide" });
	});
});

describe("arcade cleanup", () => {
	const hour = 3600_000;
	const insert = (
		t: T,
		status: "open" | "verifying" | "verified" | "rejected",
		startedAge: number,
		submittedAge?: number,
	) =>
		t.run((ctx) =>
			ctx.db.insert("arcadeRuns", {
				ownerId: "guest:cleanup",
				seed: 7,
				layout: "wide",
				status,
				startedAt: Date.now() - startedAge * hour,
				submittedAt: submittedAge === undefined ? undefined : Date.now() - submittedAge * hour,
			}),
		);

	test("retention follows status: open by start, verifying by submission, finished after a day", async () => {
		const t = setup();
		const keep = [
			await insert(t, "open", 1),
			// Started long ago (a long pause) but submitted just now: must survive until verified.
			await insert(t, "verifying", 3, 0.1),
			await insert(t, "verified", 3),
			await insert(t, "rejected", 3),
		];
		await insert(t, "open", 3);
		await insert(t, "verifying", 3, 2);
		await insert(t, "verified", 25);
		await insert(t, "rejected", 25);
		await t.mutation(internal.arcade.internal.cleanupRuns, {});
		const left = (await t.run((ctx) => ctx.db.query("arcadeRuns").collect())).map((run) => run._id);
		expect(left.sort()).toEqual(keep.sort());
	});

	test("a backlog drains in bounded batches that schedule the next pass", async () => {
		const t = setup();
		const keep = await insert(t, "open", 1);
		for (let i = 0; i < 230; i++) await insert(t, "open", 30);
		await t.mutation(internal.arcade.internal.cleanupRuns, {});
		expect(await t.run((ctx) => ctx.db.query("arcadeRuns").collect())).toHaveLength(131);
		await t.finishAllScheduledFunctions(vi.runAllTimers);
		expect((await t.run((ctx) => ctx.db.query("arcadeRuns").collect())).map((run) => run._id)).toEqual([keep]);
	});

	test("a run past its lifetime can no longer be submitted", async () => {
		const t = setup();
		const { runId, seed } = await t.mutation(api.arcade.mutations.startRun, {
			guestToken: await tok(GUEST_A),
			layout: "wide",
		});
		const game = play(seed);
		vi.setSystemTime(Date.now() + 2 * hour + 1000);
		const err = await t
			.mutation(api.arcade.mutations.submitRun, {
				runId,
				inputs: game.inputs,
				initials: "ABC",
				guestToken: await tok(GUEST_A),
			})
			.catch((e: { data?: { code?: string } }) => e.data?.code);
		expect(err).toBe("BAD_RUN");
	});
});
