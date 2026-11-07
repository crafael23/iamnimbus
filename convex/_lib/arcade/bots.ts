/**
 * The system's riders. Each picks a heading as it enters a cell, from the
 * three that are not a reversal. Deterministic: integer math, and any
 * randomness comes from the game's seeded generator.
 *
 * The three brains follow the progression in the light-cycle AI literature:
 * - Drifter: reactive wall avoidance with the odd random turn, the opponent of
 *   momajd/Tron (github.com/momajd/Tron).
 * - Spacer: flood-fills each option and keeps to the larger open area.
 * - Cutter: scores each option by the cells it reaches before you do (a
 *   Voronoi split of the board), the territory idea of nlieb/PyTron
 *   (github.com/nlieb/PyTron), and falls back to Spacer once walled off.
 * Ideas only; no code was copied.
 */

import { Brain, type Cycle, DX, DY, type Dir, type Game, isFree, randomInt } from "./engine";

/** The largest board (both layouts have 5,760 cells). */
const MAX_CELLS = 96 * 60;
const stamp = new Int32Array(MAX_CELLS);
const queue = new Int32Array(MAX_CELLS);
const dist = new Int32Array(MAX_CELLS);
const owner = new Uint8Array(MAX_CELLS);
let gen = 0;

/** A fresh visit mark, so the scratch arrays never need clearing. */
function nextGen() {
	gen++;
	if (gen > 0x3fffffff) {
		stamp.fill(0);
		gen = 1;
	}
	return gen;
}

const left = (d: Dir) => ((d + 3) & 3) as Dir;
const right = (d: Dir) => ((d + 1) & 3) as Dir;

/** Free cells in a straight line from the cycle, up to `max`. */
function run(game: Game, c: Cycle, d: Dir, max: number) {
	let n = 0;
	let x = c.x + DX[d];
	let y = c.y + DY[d];
	while (n < max && isFree(game, x, y)) {
		n++;
		x += DX[d];
		y += DY[d];
	}
	return n;
}

/** Free cells reachable from a free cell (inclusive), counting at most `cap`. */
export function reach(game: Game, x: number, y: number, cap: number) {
	if (!isFree(game, x, y)) return 0;
	const { w, h, board } = game;
	const g = nextGen();
	let head = 0;
	let tail = 0;
	const start = y * w + x;
	stamp[start] = g;
	queue[tail++] = start;
	while (head < tail && tail < cap) {
		const i = queue[head++]!;
		const cx = i % w;
		if (cx > 0 && board[i - 1] === 0 && stamp[i - 1] !== g) {
			stamp[i - 1] = g;
			queue[tail++] = i - 1;
		}
		if (cx < w - 1 && board[i + 1] === 0 && stamp[i + 1] !== g) {
			stamp[i + 1] = g;
			queue[tail++] = i + 1;
		}
		if (i >= w && board[i - w] === 0 && stamp[i - w] !== g) {
			stamp[i - w] = g;
			queue[tail++] = i - w;
		}
		if (i < w * (h - 1) && board[i + w] === 0 && stamp[i + w] !== g) {
			stamp[i + w] = g;
			queue[tail++] = i + w;
		}
	}
	return Math.min(tail, cap);
}

const MINE = 1;
const THEIRS = 2;
const TIED = 3;

/**
 * Split the free board between a bot about to enter (bx, by) and a rival
 * whose head is at (px, py): each cell goes to whoever reaches it first.
 * `met` is false when the two regions never touch (they are walled apart).
 */
export function territory(game: Game, bx: number, by: number, px: number, py: number) {
	const { w, h, board } = game;
	const g = nextGen();
	let head = 0;
	let tail = 0;
	const seed = (i: number, who: number) => {
		if (stamp[i] === g) {
			owner[i] = TIED;
			return;
		}
		stamp[i] = g;
		dist[i] = 0;
		owner[i] = who;
		queue[tail++] = i;
	};
	seed(by * w + bx, MINE);
	for (let d = 0; d < 4; d++) {
		const x = px + DX[d];
		const y = py + DY[d];
		if (isFree(game, x, y)) seed(y * w + x, THEIRS);
	}
	let met = false;
	let mine = 0;
	let theirs = 0;
	const visit = (i: number, n: number) => {
		if (board[n] !== 0) return;
		if (stamp[n] !== g) {
			stamp[n] = g;
			dist[n] = dist[i]! + 1;
			owner[n] = owner[i]!;
			queue[tail++] = n;
		} else if (owner[n] !== owner[i]) {
			met = true;
			if (dist[n] === dist[i]! + 1) owner[n] = TIED;
		}
	};
	while (head < tail) {
		const i = queue[head++]!;
		const o = owner[i];
		if (o === MINE) mine++;
		else if (o === THEIRS) theirs++;
		const cx = i % w;
		if (cx > 0) visit(i, i - 1);
		if (cx < w - 1) visit(i, i + 1);
		if (i >= w) visit(i, i - w);
		if (i < w * (h - 1)) visit(i, i + w);
	}
	return { mine, theirs, met };
}

/** True if another live cycle could move into (x, y) on its next step. */
function contested(game: Game, self: Cycle, x: number, y: number) {
	for (const o of game.cycles) {
		if (o === self || !o.alive) continue;
		if (Math.abs(o.x - x) + Math.abs(o.y - y) === 1) return true;
	}
	return false;
}

const REACH_CAP = 2400;

export function decideBot(game: Game, c: Cycle): Dir {
	const options: Dir[] = [c.dir, left(c.dir), right(c.dir)];
	if (c.brain === Brain.Drifter) return drift(game, c, options);

	const player = game.cycles[0]!;
	let best = c.dir;
	let bestScore = -Infinity;
	for (const d of options) {
		const x = c.x + DX[d];
		const y = c.y + DY[d];
		if (!isFree(game, x, y)) continue;
		let score: number;
		if (c.brain === Brain.Cutter && player.alive) {
			const t = territory(game, x, y, player.x, player.y);
			score = t.met ? (t.mine - t.theirs) * 4 : reach(game, x, y, REACH_CAP) * 4;
		} else {
			score = reach(game, x, y, REACH_CAP) * 4;
		}
		if (contested(game, c, x, y)) score -= 80;
		if (d === c.dir) score += 2;
		score += randomInt(game, 3);
		if (score > bestScore) {
			bestScore = score;
			best = d;
		}
	}
	return best;
}

function drift(game: Game, c: Cycle, options: Dir[]): Dir {
	const ahead = run(game, c, c.dir, 24);
	const wander = randomInt(game, 100) < 3;
	if (ahead > 2 && !wander) return c.dir;
	const l = run(game, c, options[1]!, 24);
	const r = run(game, c, options[2]!, 24);
	const need = ahead > 2 ? 4 : 1;
	if (l >= need || r >= need) {
		if (l === r) return options[1 + randomInt(game, 2)]!;
		return l > r ? options[1]! : options[2]!;
	}
	return c.dir;
}
