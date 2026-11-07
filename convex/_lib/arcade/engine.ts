/**
 * The light-cycle game's rules: a pure, deterministic simulation shared by the
 * browser (which plays it) and the server (which replays a run from its seed
 * and inputs before a score reaches the leaderboard).
 *
 * Determinism rules for this file and bots.ts: integer math only, no
 * Math.random, no clocks, no iteration over unordered collections. The same
 * seed and the same inputs must give the same game in every JS engine.
 *
 * Shape of the rules (credit where the ideas came from):
 * - A discrete grid advanced at a fixed tick, every cycle moving at the same
 *   time, with same-cell and head-on crashes resolved together: the model of
 *   CodeClash LightCycles' engine.py (github.com/CodeClash-ai/LightCycles).
 * - Boost on a regenerating meter, from Tortured-Metaphor/LightCycle
 *   (github.com/Tortured-Metaphor/LightCycle).
 * - Riding close to a wall to earn speed ("grinding"), after the wall
 *   proximity mechanics of Armagetron Advanced (armagetronad.org).
 * No code was copied from any of them.
 */

import { decideBot } from "./bots";

export const TICK_HZ = 60;
/** Sub-steps per cell. Speeds stay below this, so a cycle moves at most one cell per tick (no tunneling). */
export const SUB = 16;

export const LAYOUTS = {
	wide: { w: 96, h: 60 },
	tall: { w: 60, h: 96 },
} as const;
export type Layout = keyof typeof LAYOUTS;

/** 0 up, 1 right, 2 down, 3 left. */
export type Dir = 0 | 1 | 2 | 3;
export const DX = [0, 1, 0, -1] as const;
export const DY = [-1, 0, 1, 0] as const;

/** Input codes. A recorded input is `tick * 8 + code`. */
export const INPUT = { up: 0, right: 1, down: 2, left: 3, boostOn: 4, boostOff: 5 } as const;
export const encodeInput = (tick: number, code: number) => tick * 8 + code;

/** Board cells: 0 empty, 1 block, 2 + i the trail of cycle i (the player is cycle 0). */
export const EMPTY = 0;
export const BLOCK = 1;
export const trailOf = (cycle: number) => 2 + cycle;

export const READY_TICKS = 96;
export const END_TICKS = 100;
/** How long a crashed cycle's trail lingers before it dissolves and frees the cells. */
export const DEREZ_TICKS = 45;
/** A run can never be longer than this (30 minutes of play). */
export const MAX_TICKS = TICK_HZ * 60 * 30;
export const START_LIVES = 3;

/** Boost energy, in quarter-ticks so regeneration stays integral. */
export const ENERGY_MAX = 720;
const BOOST_DRAIN = 4;
const BOOST_SPEED = 4;
const ENERGY_REGEN = 1;
const GRIND_REGEN = 4;
export const WIN_BONUS = 1000;

export const Brain = {
	/** Rides straight, turns late, wanders now and then. */
	Drifter: 0,
	/** Keeps to the most open space. */
	Spacer: 1,
	/** Claims the cells it can reach before you, and cuts you off. */
	Cutter: 2,
} as const;
export type Brain = (typeof Brain)[keyof typeof Brain];

export type LevelSpec = { brains: Brain[]; speed: number; blocks: number };

export function levelSpec(level: number): LevelSpec {
	switch (level) {
		case 1:
			return { brains: [Brain.Drifter], speed: 4, blocks: 0 };
		case 2:
			return { brains: [Brain.Spacer], speed: 4, blocks: 0 };
		case 3:
			return { brains: [Brain.Drifter, Brain.Spacer], speed: 4, blocks: 0 };
		case 4:
			return { brains: [Brain.Cutter], speed: 4, blocks: 3 };
		case 5:
			return { brains: [Brain.Spacer, Brain.Cutter], speed: 5, blocks: 3 };
		case 6:
			return { brains: [Brain.Drifter, Brain.Spacer, Brain.Cutter], speed: 5, blocks: 4 };
		default:
			return {
				brains: [Brain.Cutter, Brain.Spacer, Brain.Cutter],
				speed: level < 10 ? 6 : 7,
				blocks: Math.min(8, level - 2),
			};
	}
}

export type Cycle = {
	index: number;
	/** -1 for the player. */
	brain: Brain | -1;
	x: number;
	y: number;
	/** Direction of the current traversal, chosen on entering the cell. */
	dir: Dir;
	/** 0..SUB-1: how far into the traversal toward the next cell. */
	progress: number;
	speed: number;
	alive: boolean;
	/** Tick the trail dissolves, once crashed. */
	derezAt: number;
	/** Trail cells (board indices), oldest first. */
	trail: Int32Array;
	trailLen: number;
	/** True for the traversal after entering a cell with a wall alongside. */
	grinding: boolean;
};

export type Phase = "ready" | "play" | "end" | "over";
export type RoundResult = "win" | "lose" | "draw";

export type GameEvent =
	| { type: "crash"; cycle: number; x: number; y: number }
	| { type: "derez"; cycle: number }
	| { type: "turn"; cycle: number }
	| { type: "round"; result: RoundResult }
	| { type: "phase"; phase: Phase };

export type Game = {
	layout: Layout;
	w: number;
	h: number;
	/** Cell owners (see EMPTY, BLOCK, trailOf). */
	board: Uint8Array;
	/** Per-cell bits 1 << dir: the trail leaves or enters the cell on that side. For rendering. */
	conn: Uint8Array;
	/** Bumped whenever board or conn change. */
	version: number;
	tick: number;
	phase: Phase;
	/** Tick the current phase ends (ready, end). */
	phaseEnds: number;
	level: number;
	lives: number;
	score: number;
	energy: number;
	boosting: boolean;
	/** Player turns waiting for the next cell. */
	queue: Dir[];
	rng: number;
	cycles: Cycle[];
	result: RoundResult | null;
	/** Rounds played, for spawning variety. */
	round: number;
	/** Events from the last step; cleared at the start of each step. */
	events: GameEvent[];
};

/** mulberry32: one uint32 of state, integer math only. */
export function nextRandom(game: { rng: number }): number {
	const s = (game.rng + 0x6d2b79f5) | 0;
	game.rng = s;
	let t = Math.imul(s ^ (s >>> 15), 1 | s);
	t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
	return (t ^ (t >>> 14)) >>> 0;
}

export const randomInt = (game: { rng: number }, n: number) => nextRandom(game) % n;

export function createGame(seed: number, layout: Layout): Game {
	const { w, h } = LAYOUTS[layout];
	const game: Game = {
		layout,
		w,
		h,
		board: new Uint8Array(w * h),
		conn: new Uint8Array(w * h),
		version: 0,
		tick: 0,
		phase: "ready",
		phaseEnds: 0,
		level: 1,
		lives: START_LIVES,
		score: 0,
		energy: ENERGY_MAX,
		boosting: false,
		queue: [],
		rng: seed | 0,
		cycles: [],
		result: null,
		round: 0,
		events: [],
	};
	startRound(game);
	return game;
}

type Spawn = { x: number; y: number; dir: Dir };

/** Spawns on the wide board; the tall board is its transpose. */
const PLAYER_SPAWN: Spawn = { x: 10, y: 30, dir: 1 };
const BOT_SPAWNS: Spawn[] = [
	{ x: 85, y: 29, dir: 3 },
	{ x: 48, y: 6, dir: 2 },
	{ x: 47, y: 53, dir: 0 },
];
/** Transposing swaps axes: up<->left, right<->down. */
const TRANSPOSE_DIR: Dir[] = [3, 2, 1, 0];

function place(game: Game, s: Spawn): Spawn {
	return game.layout === "wide" ? s : { x: s.y, y: s.x, dir: TRANSPOSE_DIR[s.dir]! };
}

function startRound(game: Game) {
	const spec = levelSpec(game.level);
	game.board.fill(EMPTY);
	game.conn.fill(0);
	game.version++;
	game.round++;
	game.result = null;
	game.queue.length = 0;
	game.energy = ENERGY_MAX;
	const spawns = [PLAYER_SPAWN, ...BOT_SPAWNS.slice(0, spec.brains.length)].map((s) => place(game, s));
	game.cycles = spawns.map((s, i) => {
		const cycle: Cycle = {
			index: i,
			brain: i === 0 ? -1 : spec.brains[i - 1]!,
			x: s.x,
			y: s.y,
			dir: s.dir,
			progress: 0,
			speed: spec.speed,
			alive: true,
			derezAt: -1,
			trail: new Int32Array(game.w * game.h),
			trailLen: 0,
			grinding: false,
		};
		occupy(game, cycle, s.x, s.y);
		return cycle;
	});
	placeBlocks(game, spec.blocks, spawns);
	game.phase = "ready";
	game.phaseEnds = game.tick + READY_TICKS;
}

/** Seeded rectangles, kept clear of every spawn and the lane in front of it. */
function placeBlocks(game: Game, count: number, spawns: Spawn[]) {
	let placed = 0;
	for (let attempt = 0; attempt < 80 && placed < count; attempt++) {
		const bw = 2 + randomInt(game, 5);
		const bh = 2 + randomInt(game, 5);
		const x0 = 3 + randomInt(game, game.w - bw - 6);
		const y0 = 3 + randomInt(game, game.h - bh - 6);
		let clear = true;
		for (const s of spawns) {
			// Reject anything near the spawn or within 14 cells ahead of it.
			const ax = Math.min(s.x, s.x + DX[s.dir] * 14) - 6;
			const bx = Math.max(s.x, s.x + DX[s.dir] * 14) + 6;
			const ay = Math.min(s.y, s.y + DY[s.dir] * 14) - 6;
			const by = Math.max(s.y, s.y + DY[s.dir] * 14) + 6;
			if (x0 <= bx && x0 + bw - 1 >= ax && y0 <= by && y0 + bh - 1 >= ay) {
				clear = false;
				break;
			}
		}
		if (!clear) continue;
		for (let y = y0; y < y0 + bh; y++) {
			for (let x = x0; x < x0 + bw; x++) game.board[y * game.w + x] = BLOCK;
		}
		placed++;
	}
}

function occupy(game: Game, cycle: Cycle, x: number, y: number) {
	const i = y * game.w + x;
	game.board[i] = trailOf(cycle.index);
	cycle.trail[cycle.trailLen++] = i;
}

export const inBounds = (game: Game, x: number, y: number) => x >= 0 && y >= 0 && x < game.w && y < game.h;

export function isFree(game: Game, x: number, y: number) {
	return inBounds(game, x, y) && game.board[y * game.w + x] === EMPTY;
}

const opposite = (d: Dir) => ((d + 2) & 3) as Dir;

function steer(game: Game, dir: Dir) {
	const player = game.cycles[0]!;
	if (game.phase === "ready") {
		// Before the start, pick any heading.
		player.dir = dir;
		return;
	}
	const last = game.queue.length ? game.queue[game.queue.length - 1]! : player.dir;
	if (dir === last || dir === opposite(last) || game.queue.length >= 2) return;
	game.queue.push(dir);
}

/** Scratch for one tick's moves; the board never has more than four cycles. */
const targets = new Int32Array(4);
const stepping = new Uint8Array(4);

/**
 * Advance one tick. `inputs` are this tick's input codes (see INPUT), in the
 * order they were pressed.
 */
export function step(game: Game, inputs: ArrayLike<number>) {
	game.events.length = 0;
	if (game.phase === "over") return;

	for (let k = 0; k < inputs.length; k++) {
		const code = inputs[k]!;
		if (code <= 3) steer(game, code as Dir);
		else if (code === INPUT.boostOn) game.boosting = true;
		else if (code === INPUT.boostOff) game.boosting = false;
	}

	game.tick++;
	// One deadline for the whole run, whatever phase it falls in, so live play and replay end together.
	if (game.tick >= MAX_TICKS) {
		setPhase(game, "over");
		return;
	}
	if (game.phase === "ready") {
		if (game.tick >= game.phaseEnds) setPhase(game, "play");
		return;
	}
	if (game.phase === "end") {
		if (game.tick >= game.phaseEnds) {
			if (game.lives <= 0) setPhase(game, "over");
			else {
				startRound(game);
				game.events.push({ type: "phase", phase: "ready" });
			}
		}
		return;
	}
	advance(game);
}

function setPhase(game: Game, phase: Phase) {
	game.phase = phase;
	game.events.push({ type: "phase", phase });
}

function advance(game: Game) {
	const { cycles, board, w } = game;
	const player = cycles[0]!;

	// Dissolve trails of cycles that crashed a moment ago.
	for (const c of cycles) {
		if (!c.alive && c.derezAt === game.tick) {
			for (let k = 0; k < c.trailLen; k++) {
				board[c.trail[k]!] = EMPTY;
				game.conn[c.trail[k]!] = 0;
			}
			c.trailLen = 0;
			game.version++;
			game.events.push({ type: "derez", cycle: c.index });
		}
	}

	// Boost and energy (player only).
	const boosting = player.alive && game.boosting && game.energy >= BOOST_DRAIN;
	const spec = levelSpec(game.level);
	player.speed = spec.speed + (boosting ? BOOST_SPEED : 0);
	game.energy += boosting ? -BOOST_DRAIN : ENERGY_REGEN;
	if (player.grinding) game.energy += GRIND_REGEN;
	if (game.energy > ENERGY_MAX) game.energy = ENERGY_MAX;

	// Who completes a traversal this tick, and into which cell.
	for (let i = 0; i < cycles.length; i++) {
		const c = cycles[i]!;
		stepping[i] = 0;
		if (!c.alive) continue;
		c.progress += c.speed;
		if (c.progress < SUB) continue;
		c.progress -= SUB;
		stepping[i] = 1;
		const tx = c.x + DX[c.dir];
		const ty = c.y + DY[c.dir];
		targets[i] = inBounds(game, tx, ty) ? ty * w + tx : -1;
	}

	// Resolve all moves together: walls, trails, and two cycles taking the same cell.
	let crashed = false;
	for (let i = 0; i < cycles.length; i++) {
		if (!stepping[i]) continue;
		const t = targets[i]!;
		let hit = t < 0 || board[t] !== EMPTY;
		for (let j = 0; j < cycles.length && !hit; j++) {
			if (j !== i && stepping[j] && targets[j] === t) hit = true;
		}
		if (hit) {
			const c = cycles[i]!;
			stepping[i] = 2;
			crashed = true;
			game.events.push({ type: "crash", cycle: i, x: c.x + DX[c.dir], y: c.y + DY[c.dir] });
		}
	}
	if (crashed) {
		for (let i = 0; i < cycles.length; i++) {
			if (stepping[i] !== 2) continue;
			const c = cycles[i]!;
			c.alive = false;
			c.progress = 0;
			c.derezAt = game.tick + DEREZ_TICKS;
		}
	}

	// Move the survivors in.
	for (let i = 0; i < cycles.length; i++) {
		if (stepping[i] !== 1) continue;
		const c = cycles[i]!;
		const from = c.y * w + c.x;
		const to = targets[i]!;
		game.conn[from] |= 1 << c.dir;
		game.conn[to] |= 1 << opposite(c.dir);
		c.x += DX[c.dir];
		c.y += DY[c.dir];
		occupy(game, c, c.x, c.y);
		// A wall alongside, on either side of the direction just travelled.
		const l = ((c.dir + 3) & 3) as Dir;
		const r = ((c.dir + 1) & 3) as Dir;
		c.grinding = !isFree(game, c.x + DX[l], c.y + DY[l]) || !isFree(game, c.x + DX[r], c.y + DY[r]);
		if (i === 0) game.score += game.level * (c.grinding ? 2 : 1);
	}
	game.version++;

	// Choose the next heading for everyone who just entered a cell.
	for (let i = 0; i < cycles.length; i++) {
		if (stepping[i] !== 1) continue;
		const c = cycles[i]!;
		const before = c.dir;
		if (i === 0) {
			const next = game.queue.shift();
			if (next !== undefined) c.dir = next;
		} else {
			c.dir = decideBot(game, c);
		}
		if (c.dir !== before) game.events.push({ type: "turn", cycle: i });
	}

	// Round over?
	const botsAlive = cycles.some((c) => c.index > 0 && c.alive);
	if (!player.alive) endRound(game, botsAlive ? "lose" : "draw");
	else if (!botsAlive) endRound(game, "win");
}

function endRound(game: Game, result: RoundResult) {
	game.result = result;
	if (result === "win") {
		game.score += WIN_BONUS * game.level;
		game.level++;
	} else if (result === "lose") {
		game.lives--;
	}
	game.events.push({ type: "round", result });
	setPhase(game, "end");
	game.phaseEnds = game.tick + END_TICKS;
}

export type ReplayResult =
	| { ok: true; score: number; level: number; ticks: number }
	| { ok: false; reason: "bad-input" | "unfinished" };

/** Most input events a run may record. */
export const MAX_INPUTS = 20_000;

/**
 * Replay a run from its seed and recorded inputs. Valid only if the inputs
 * are in tick order and the game is over by the last tick.
 */
export function replay(seed: number, layout: Layout, inputs: readonly number[]): ReplayResult {
	if (inputs.length > MAX_INPUTS) return { ok: false, reason: "bad-input" };
	const game = createGame(seed, layout);
	const frame: number[] = [];
	let k = 0;
	let lastTick = 0;
	for (const input of inputs) {
		if (!Number.isSafeInteger(input) || input < 0) return { ok: false, reason: "bad-input" };
		const code = input % 8;
		const tick = (input - code) / 8;
		// The last step a run can take advances MAX_TICKS - 1 -> MAX_TICKS.
		if (code > 5 || tick < lastTick || tick >= MAX_TICKS) return { ok: false, reason: "bad-input" };
		lastTick = tick;
	}
	while (game.phase !== "over") {
		frame.length = 0;
		// Inputs recorded at tick t were applied by the step that advanced t -> t + 1.
		while (k < inputs.length && Math.floor(inputs[k]! / 8) === game.tick) frame.push(inputs[k++]! % 8);
		step(game, frame);
	}
	if (game.phase !== "over" || k < inputs.length) return { ok: false, reason: "unfinished" };
	return { ok: true, score: game.score, level: game.level, ticks: game.tick };
}
