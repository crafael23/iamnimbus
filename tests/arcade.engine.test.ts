import { describe, expect, test } from "vitest";
import { decideBot, reach, territory } from "../convex/_lib/arcade/bots";
import {
	createGame,
	type Cycle,
	DX,
	DY,
	type Dir,
	EMPTY,
	encodeInput,
	type Game,
	INPUT,
	levelSpec,
	MAX_TICKS,
	READY_TICKS,
	replay,
	SUB,
	step,
	trailOf,
} from "../convex/_lib/arcade/engine";

const NONE: number[] = [];

function runTicks(game: Game, n: number, inputs: number[] = NONE) {
	for (let i = 0; i < n; i++) step(game, i === 0 ? inputs : NONE);
}

/** A game in play with a clear board and only the cycles given. */
function arena(cycles: Array<{ x: number; y: number; dir: Dir; speed?: number }>): Game {
	const game = createGame(1, "wide");
	runTicks(game, READY_TICKS);
	game.board.fill(EMPTY);
	game.conn.fill(0);
	game.cycles = cycles.map((s, i): Cycle => {
		const trail = new Int32Array(game.w * game.h);
		trail[0] = s.y * game.w + s.x;
		game.board[s.y * game.w + s.x] = trailOf(i);
		return {
			index: i,
			brain: i === 0 ? -1 : 1,
			x: s.x,
			y: s.y,
			dir: s.dir,
			progress: 0,
			speed: s.speed ?? 4,
			alive: true,
			derezAt: -1,
			trail,
			trailLen: 1,
			grinding: false,
		};
	});
	return game;
}

/**
 * A stand-in player: before each cell, steer toward the larger open area.
 * Returns the recorded inputs, the way the client records them.
 */
function autoplay(game: Game, maxTicks = MAX_TICKS) {
	const recorded: number[] = [];
	const frame: number[] = [];
	let lastPlanned = -1;
	while (game.phase !== "over" && game.tick < maxTicks) {
		frame.length = 0;
		const p = game.cycles[0]!;
		if (game.phase === "play" && p.alive) {
			const cell = (p.y + DY[p.dir]) * game.w + (p.x + DX[p.dir]);
			if (cell !== lastPlanned && game.queue.length === 0) {
				lastPlanned = cell;
				const tx = p.x + DX[p.dir];
				const ty = p.y + DY[p.dir];
				let best = p.dir;
				let bestArea = -1;
				for (const d of [p.dir, ((p.dir + 1) & 3) as Dir, ((p.dir + 3) & 3) as Dir]) {
					const area = reach(game, tx + DX[d], ty + DY[d], 4000);
					if (area > bestArea) {
						bestArea = area;
						best = d;
					}
				}
				if (best !== p.dir) frame.push(best);
			}
			// Boost in bursts to exercise the energy meter.
			if (game.tick % 300 === 0) frame.push(INPUT.boostOn);
			if (game.tick % 300 === 90) frame.push(INPUT.boostOff);
		}
		for (const code of frame) recorded.push(encodeInput(game.tick, code));
		step(game, frame);
	}
	return recorded;
}

describe("rules", () => {
	test("speeds never reach a cell per tick, so nothing tunnels", () => {
		for (let level = 1; level <= 40; level++) expect(levelSpec(level).speed + 4).toBeLessThan(SUB);
	});

	test("a cycle that rides into the border crashes and the round is lost", () => {
		const game = createGame(7, "wide");
		runTicks(game, 2000);
		expect(game.lives).toBeLessThan(3);
	});

	test("reversing is ignored", () => {
		const game = arena([
			{ x: 10, y: 10, dir: 1 },
			{ x: 80, y: 50, dir: 3 },
		]);
		step(game, [INPUT.left]);
		expect(game.queue).toEqual([]);
		runTicks(game, 8);
		expect(game.cycles[0]!.alive).toBe(true);
		expect(game.cycles[0]!.dir).toBe(1);
	});

	test("two cycles entering the same cell both crash: a draw", () => {
		const game = arena([
			{ x: 10, y: 10, dir: 1 },
			{ x: 12, y: 10, dir: 3 },
		]);
		runTicks(game, SUB / 4);
		expect(game.cycles.map((c) => c.alive)).toEqual([false, false]);
		expect(game.result).toBe("draw");
		expect(game.lives).toBe(3);
	});

	test("cycles facing each other in adjacent cells both crash", () => {
		const game = arena([
			{ x: 10, y: 10, dir: 1 },
			{ x: 11, y: 10, dir: 3 },
		]);
		runTicks(game, SUB / 4);
		expect(game.result).toBe("draw");
	});

	test("riding into a trail crashes and costs a life", () => {
		const game = arena([
			{ x: 10, y: 20, dir: 1 },
			{ x: 80, y: 50, dir: 3 },
		]);
		for (let y = 0; y < game.h; y++) game.board[y * game.w + 15] = trailOf(1);
		runTicks(game, (SUB / 4) * 5);
		expect(game.cycles[0]!.alive).toBe(false);
		expect(game.result).toBe("lose");
		expect(game.lives).toBe(2);
		expect(game.score).toBe(4);
	});

	test("the last bot down wins the round, with a bonus, and the level advances", () => {
		const game = arena([
			{ x: 10, y: 30, dir: 1 },
			{ x: 50, y: 0, dir: 0 },
		]);
		runTicks(game, SUB / 4);
		expect(game.result).toBe("win");
		expect(game.level).toBe(2);
		expect(game.score).toBe(1 + 1000);
		runTicks(game, 120);
		expect(game.phase).toBe("ready");
		expect(game.cycles).toHaveLength(2);
	});

	test("a crashed bot's trail dissolves and frees its cells", () => {
		const game = arena([
			{ x: 10, y: 30, dir: 1 },
			{ x: 50, y: 0, dir: 0 },
			{ x: 70, y: 40, dir: 3 },
		]);
		// Bot 1 sits against the top border heading up: it crashes on its first step.
		runTicks(game, SUB / 4);
		expect(game.cycles[1]!.alive).toBe(false);
		expect(game.board[50]).toBe(trailOf(1));
		expect(game.phase).toBe("play");
		runTicks(game, 60);
		expect(game.board[50]).toBe(EMPTY);
	});

	test("riding alongside a wall doubles the points and refills boost", () => {
		const game = arena([
			{ x: 10, y: 0, dir: 1 },
			{ x: 80, y: 50, dir: 3 },
		]);
		// The top border runs alongside row 0.
		game.energy = 0;
		runTicks(game, SUB / 4);
		expect(game.cycles[0]!.grinding).toBe(true);
		expect(game.score).toBe(2);
		runTicks(game, 8);
		expect(game.energy).toBeGreaterThan(8);
	});
});

describe("bots", () => {
	test("every brain turns away from a wall dead ahead", () => {
		for (const brain of [0, 1, 2] as const) {
			const game = arena([
				{ x: 10, y: 30, dir: 1 },
				{ x: 50, y: 0, dir: 0 },
			]);
			game.cycles[1]!.brain = brain;
			for (let seed = 0; seed < 20; seed++) {
				game.rng = seed;
				expect([1, 3]).toContain(decideBot(game, game.cycles[1]!));
			}
		}
	});

	test("the spacer leaves a dead end for the open side", () => {
		const game = arena([
			{ x: 10, y: 30, dir: 1 },
			{ x: 50, y: 20, dir: 0 },
		]);
		// A closed box to the bot's left (x 46..49, y 16..24); the wall ahead is the box's right side.
		for (let y = 15; y <= 25; y++) {
			game.board[y * game.w + 45] = trailOf(0);
			if (y !== 20) game.board[y * game.w + 50] = trailOf(0);
		}
		for (let x = 45; x <= 50; x++) {
			game.board[15 * game.w + x] = trailOf(0);
			game.board[25 * game.w + x] = trailOf(0);
		}
		expect(decideBot(game, game.cycles[1]!)).toBe(1);
	});

	test("territory splits the board between two riders", () => {
		const game = arena([
			{ x: 10, y: 30, dir: 1 },
			{ x: 80, y: 30, dir: 3 },
		]);
		const t = territory(game, 79, 30, 10, 30);
		expect(t.met).toBe(true);
		expect(t.mine).toBeGreaterThan(t.theirs * 0.5);
		expect(t.mine + t.theirs).toBeLessThanOrEqual(game.w * game.h);
	});
});

describe("replay", () => {
	test("the same seed and inputs give the same game, and replay agrees with live play", () => {
		for (const [seed, layout] of [
			[12345, "wide"],
			[-99, "tall"],
			[0x7fffffff, "wide"],
		] as const) {
			const live = createGame(seed, layout);
			const inputs = autoplay(live);
			expect(live.phase).toBe("over");
			const result = replay(seed, layout, inputs);
			expect(result).toEqual({ ok: true, score: live.score, level: live.level, ticks: live.tick });
		}
	});

	test("the run deadline ends the game in any phase, and replay agrees", () => {
		for (const phase of ["ready", "play", "end"] as const) {
			const game = createGame(5, "wide");
			if (phase !== "ready") runTicks(game, READY_TICKS);
			if (phase === "end") {
				game.cycles[0]!.x = game.w - 1;
				game.cycles[0]!.dir = 1;
				game.cycles[0]!.progress = SUB - 1;
				step(game, NONE);
				expect(game.phase).toBe("end");
			}
			game.tick = MAX_TICKS - 1;
			step(game, NONE);
			expect(game.phase).toBe("over");
			expect(game.tick).toBe(MAX_TICKS);
		}
		expect(replay(1, "wide", [encodeInput(MAX_TICKS, 1)])).toEqual({ ok: false, reason: "bad-input" });
	});

	test("a different seed gives a different game for the same inputs", () => {
		const live = createGame(1, "wide");
		const inputs = autoplay(live);
		const other = replay(2, "wide", inputs);
		expect(other.ok && other.score === live.score && other.ticks === live.tick).toBe(false);
	});

	test("out-of-order, malformed, or unfinished inputs are rejected", () => {
		expect(replay(1, "wide", [encodeInput(10, 1), encodeInput(5, 2)])).toEqual({ ok: false, reason: "bad-input" });
		expect(replay(1, "wide", [encodeInput(10, 7)])).toEqual({ ok: false, reason: "bad-input" });
		expect(replay(1, "wide", [1.5])).toEqual({ ok: false, reason: "bad-input" });
		expect(replay(1, "wide", [encodeInput(MAX_TICKS + 1, 1)])).toEqual({ ok: false, reason: "bad-input" });
		// Inputs past the end of the game.
		const live = createGame(3, "wide");
		const inputs = autoplay(live);
		expect(replay(3, "wide", [...inputs, encodeInput(live.tick + 5, 1)]).ok).toBe(false);
	});
});
