/**
 * Runs the game: a fixed 60 Hz simulation, drawn at most 60 times a second
 * (high-refresh screens skip frames rather than burn power), stopped
 * whenever nothing on screen is moving: paused, hidden tab, game over, or
 * an idle title screen.
 *
 * In a ranked run every input is recorded with the tick it was applied on,
 * which is all the server needs to replay the run and check the score.
 */

import { reach } from "../../../convex/_lib/arcade/bots";
import {
	createGame,
	DX,
	DY,
	type Dir,
	encodeInput,
	type Game,
	INPUT,
	type Layout,
	MAX_INPUTS,
	nextRandom,
	step,
	TICK_HZ,
} from "../../../convex/_lib/arcade/engine";
import { crtCurve } from "../crtCurve";
import { Sound } from "./audio";
import { type Palette, readPalette, Renderer, type RGB, type View } from "./renderer";

export type Mode = "attract" | "run" | "idle";
export type RunResult = { score: number; level: number; ticks: number; inputs: Uint32Array };

export type SessionEvents = {
	/** Every drawn frame of a run; the listener diffs before touching the DOM. */
	hud(game: Game): void;
	/** The run's phase changed (ready, play, end, over). */
	phase(game: Game): void;
	/** The run ended. */
	over(result: RunResult): void;
	/** The run paused itself (tab hidden, window blurred). */
	autoPaused(): void;
};

const STEP_MS = 1000 / TICK_HZ;
/** Frame cap: a little under 1/60 s, so a 60 Hz display never skips. */
const MIN_FRAME_MS = 1000 / 60 - 2.5;
/** Most device pixels we draw (about 2400×1350). */
const MAX_PIXELS = 3_300_000;
const ATTRACT_IDLE_MS = 45_000;
/** GPU time per frame we aim under; resolution drops above it (weak GPUs) and recovers below. */
const GPU_BUDGET_MS = 5;
const ADAPT_FRAMES = 120;
const TILT_START = 1.08;

const easeOut = (t: number) => 1 - (1 - t) ** 3;

export class Session {
	private renderer: Renderer;
	private readonly sound: Sound;
	private readonly palette: Palette;
	private readonly observer: ResizeObserver;
	private game: Game;
	mode: Mode = "idle";
	paused = false;
	private raf = 0;
	private last = 0;
	private acc = 0;
	private readonly pending: number[] = [];
	private readonly frame: number[] = [];
	private recorded: number[] = [];
	private boostHeld = false;
	private attractPlan = -1;
	private idleSince = 0;
	private anim: { from: number; to: number; start: number; dur: number; done?: () => void } | null = null;
	private flash = 0;
	private flashColor: RGB = [0, 0, 0];
	private shake = 0;
	private readonly view: View;
	private disposed = false;
	private quiet = 0;
	/** Resolution scale chosen by the frame-time governor (1 = full). */
	private quality = 1;
	private adaptFrames = 0;
	private adaptMisses = 0;

	constructor(
		private readonly canvas: HTMLCanvasElement,
		private readonly host: HTMLElement,
		private readonly on: SessionEvents,
		private readonly opts: { reducedMotion: boolean; muted: boolean },
	) {
		this.palette = readPalette();
		this.renderer = new Renderer(canvas, this.palette);
		this.sound = new Sound(opts.muted);
		this.game = createGame(1, this.layout());
		this.view = {
			game: this.game,
			alpha: 0,
			tilt: opts.reducedMotion ? 0 : TILT_START,
			gridFade: opts.reducedMotion ? 1 : 0,
			flash: 0,
			flashColor: this.flashColor,
			shakeX: 0,
			shakeY: 0,
		};
		this.observer = new ResizeObserver(() => this.resize());
		this.observer.observe(host);
		this.resize();
		document.addEventListener("visibilitychange", this.onHidden);
		window.addEventListener("blur", this.onHidden);
		canvas.addEventListener("webglcontextlost", this.onContextLost);
		canvas.addEventListener("webglcontextrestored", this.onContextRestored);
	}

	/** The board shape for this screen: tall on portrait phones. */
	layout(): Layout {
		const { width, height } = this.host.getBoundingClientRect();
		return height > width * 1.1 ? "tall" : "wide";
	}

	private resize() {
		const { width, height } = this.host.getBoundingClientRect();
		let dpr = Math.min(window.devicePixelRatio || 1, 2);
		if (width * height * dpr * dpr > MAX_PIXELS) dpr = Math.sqrt(MAX_PIXELS / (width * height));
		dpr *= this.quality;
		this.renderer.resize(Math.max(1, Math.round(width * dpr)), Math.max(1, Math.round(height * dpr)), crtCurve());
		if (!this.raf) this.render(0);
	}

	/** The title screen: the system rides against an autopilot. */
	attract() {
		this.mode = "attract";
		this.paused = false;
		this.game = createGame((Math.random() * 2 ** 32) | 0, this.layout());
		this.game.level = 3;
		this.game.lives = 1;
		this.idleSince = performance.now();
		this.sound.suspend();
		if (this.view.tilt > 0) this.animateTilt(0, 1500);
		this.start();
	}

	/** A run from a seed; inputs are recorded from here. */
	run(seed: number, layout: Layout) {
		this.mode = "run";
		this.paused = false;
		this.game = createGame(seed, layout);
		this.recorded = [];
		this.pending.length = 0;
		this.acc = 0;
		if (this.boostHeld) this.pending.push(INPUT.boostOn);
		clearTimeout(this.quiet);
		this.sound.ensure();
		this.sound.resume();
		if (this.view.tilt > 0) this.animateTilt(0, 600);
		this.on.phase(this.game);
		this.on.hud(this.game);
		this.start();
	}

	steer(dir: Dir) {
		this.idleSince = performance.now();
		if (this.mode !== "run" || this.paused) return;
		this.input(dir);
	}

	boost(on: boolean) {
		if (on === this.boostHeld) return;
		this.boostHeld = on;
		if (this.mode === "run" && !this.paused) this.input(on ? INPUT.boostOn : INPUT.boostOff);
	}

	private input(code: number) {
		// Past the cap an input is dropped before it reaches the game, so the replay still matches.
		if (this.recorded.length + this.pending.length < MAX_INPUTS) this.pending.push(code);
	}

	/** Wake an idle title screen. */
	poke() {
		this.idleSince = performance.now();
		if (this.mode === "attract" && !this.raf) this.start();
	}

	pause() {
		if (this.paused || this.mode !== "run") return;
		this.paused = true;
		if (this.boostHeld) {
			this.boostHeld = false;
			this.input(INPUT.boostOff);
		}
		this.sound.engine(false, 0, false, false);
		this.sound.suspend();
		this.stop();
		this.render(0);
	}

	resume() {
		if (!this.paused) return;
		this.paused = false;
		this.sound.resume();
		this.start();
	}

	setMuted(muted: boolean) {
		this.sound.setMuted(muted);
	}

	/** Tip the board back onto the horizon, then resolve. */
	exit(): Promise<void> {
		this.sound.engine(false, 0, false, false);
		if (this.opts.reducedMotion) return Promise.resolve();
		return new Promise((resolve) => {
			this.paused = true;
			this.animateTilt(TILT_START, 450, resolve);
			this.start();
		});
	}

	private animateTilt(to: number, dur: number, done?: () => void) {
		if (this.opts.reducedMotion) {
			this.view.tilt = to;
			this.view.gridFade = to > 0 ? 0 : 1;
			done?.();
			return;
		}
		this.anim = { from: this.view.tilt, to, start: performance.now(), dur, done };
	}

	private start() {
		if (this.raf || this.disposed) return;
		this.last = 0;
		this.raf = requestAnimationFrame(this.loop);
	}

	private stop() {
		cancelAnimationFrame(this.raf);
		this.raf = 0;
	}

	private loop = (now: number) => {
		this.raf = requestAnimationFrame(this.loop);
		const dt = this.last ? now - this.last : STEP_MS;
		if (this.last && dt < MIN_FRAME_MS) return;
		this.last = now;

		const simulating = !this.paused && (this.mode === "run" || this.mode === "attract");
		if (simulating) {
			this.acc += Math.min(dt, 250);
			let n = 0;
			while (this.acc >= STEP_MS && n < 8) {
				this.tick();
				this.acc -= STEP_MS;
				n++;
			}
			// Far behind (a long stall): drop the backlog instead of fast-forwarding.
			if (n === 8) this.acc = 0;
		}
		this.render(dt);
		if (simulating) this.adapt(dt);

		const g = this.game;
		if (this.mode === "run") {
			this.on.hud(g);
			const p = g.cycles[0]!;
			this.sound.engine(g.phase === "play" && p.alive, p.speed, g.boosting && g.energy >= 4, p.grinding);
		}
		// Nothing left to animate: stop drawing.
		const settled = !this.anim && this.flash < 0.002 && this.shake < 0.05;
		if (settled && (this.paused || this.mode === "idle")) this.stop();
		if (settled && this.mode === "attract" && now - this.idleSince > ATTRACT_IDLE_MS) this.stop();
	};

	/**
	 * Dynamic resolution. With GPU timers (Chrome), keep the frame under
	 * budget and climb back when there is room; without them, step down only
	 * when frames are being missed.
	 */
	private adapt(dt: number) {
		this.adaptFrames++;
		if (dt > 26) this.adaptMisses++;
		if (this.adaptFrames < ADAPT_FRAMES) return;
		const gpu = this.renderer.takeGpuTime();
		const missing = this.adaptMisses > ADAPT_FRAMES * 0.15;
		this.adaptFrames = 0;
		this.adaptMisses = 0;
		let next = this.quality;
		if ((gpu !== null && gpu > GPU_BUDGET_MS) || (gpu === null && missing)) next = Math.max(0.5, this.quality * 0.8);
		else if (gpu !== null && gpu < GPU_BUDGET_MS * 0.4 && this.quality < 1) next = Math.min(1, this.quality * 1.15);
		if (next !== this.quality) {
			this.quality = next;
			this.resize();
		}
	}

	private tick() {
		const g = this.game;
		const frame = this.frame;
		frame.length = 0;
		if (this.mode === "run") {
			for (const code of this.pending) {
				frame.push(code);
				this.recorded.push(encodeInput(g.tick, code));
			}
			this.pending.length = 0;
		} else {
			this.autopilot(g, frame);
		}
		const before = g.phase;
		step(g, frame);
		this.renderer.noteEvents(g);
		if (this.mode === "run") this.react(g, before);
		else if (g.phase === "over") {
			this.game = createGame(nextRandom(g), this.layout());
			this.game.level = 2 + (nextRandom(g) % 4);
			this.game.lives = 1;
		}
	}

	/** Sound, flash and shake for what just happened; hand phase changes to the UI. */
	private react(g: Game, before: Game["phase"]) {
		if (g.phase === "ready") {
			const left = g.phaseEnds - g.tick;
			if (left === 72 || left === 48 || left === 24) this.sound.countdown(false);
		}
		for (const e of g.events) {
			if (e.type === "crash") {
				const mine = e.cycle === 0;
				this.sound.crash(mine);
				if (mine && !this.opts.reducedMotion) this.shake = 1;
			} else if (e.type === "turn" && e.cycle === 0) this.sound.turn();
			else if (e.type === "round") {
				if (e.result === "win") {
					this.sound.win();
					this.kick(this.palette.brains[1], 0.22);
				} else if (e.result === "lose") {
					this.sound.lose();
					this.kick(this.palette.player, 0.18);
				}
			} else if (e.type === "phase" && e.phase === "play") this.sound.countdown(true);
		}
		if (g.phase !== before) {
			this.on.phase(g);
			if (g.phase === "over") {
				this.mode = "idle";
				this.sound.engine(false, 0, false, false);
				// Let the last cues ring out, then stop the audio thread until the next run.
				this.quiet = window.setTimeout(() => {
					if (this.mode !== "run") this.sound.suspend();
				}, 1500);
				this.on.over({ score: g.score, level: g.level, ticks: g.tick, inputs: Uint32Array.from(this.recorded) });
			}
		}
	}

	private kick(color: RGB, amount: number) {
		if (this.opts.reducedMotion) return;
		this.flashColor[0] = color[0];
		this.flashColor[1] = color[1];
		this.flashColor[2] = color[2];
		this.flash = amount;
	}

	/** The title screen's rider steers toward open space, like the Spacer. */
	private autopilot(g: Game, frame: number[]) {
		const p = g.cycles[0]!;
		if (g.phase !== "play" || !p.alive) return;
		const tx = p.x + DX[p.dir];
		const ty = p.y + DY[p.dir];
		const cell = ty * g.w + tx;
		if (cell === this.attractPlan || g.queue.length) return;
		this.attractPlan = cell;
		let best = p.dir;
		let bestArea = -1;
		for (const d of [p.dir, ((p.dir + 1) & 3) as Dir, ((p.dir + 3) & 3) as Dir]) {
			const area = reach(g, tx + DX[d], ty + DY[d], 1500);
			if (area > bestArea) {
				bestArea = area;
				best = d;
			}
		}
		if (best !== p.dir) frame.push(best);
	}

	private render(dt: number) {
		const v = this.view;
		const now = performance.now();
		if (this.anim) {
			const t = Math.min(1, (now - this.anim.start) / this.anim.dur);
			v.tilt = this.anim.from + (this.anim.to - this.anim.from) * easeOut(t);
			v.gridFade = 1 - v.tilt / TILT_START;
			if (t >= 1) {
				const done = this.anim.done;
				this.anim = null;
				done?.();
			}
		}
		const k = Math.exp(-dt / 140);
		this.flash *= k;
		this.shake *= Math.exp(-dt / 90);
		v.game = this.game;
		v.alpha = this.paused ? 0 : Math.min(this.acc / STEP_MS, 1);
		v.flash = this.flash;
		v.shakeX = this.shake * 7 * Math.sin(now * 0.09);
		v.shakeY = this.shake * 5 * Math.cos(now * 0.11);
		this.renderer.draw(v);
	}

	private onHidden = () => {
		if (this.mode === "run" && !this.paused && (document.hidden || !document.hasFocus())) {
			this.pause();
			this.on.autoPaused();
		}
		if (this.mode === "attract" && document.hidden) this.stop();
	};

	private onContextLost = (e: Event) => {
		// Keep the session: the browser restores the context; until then nothing draws.
		e.preventDefault();
		if (this.mode === "run") {
			this.pause();
			this.on.autoPaused();
		}
	};

	private onContextRestored = () => {
		// Every GL object died with the old context: build the renderer again.
		this.renderer = new Renderer(this.canvas, this.palette);
		this.resize();
	};

	dispose() {
		this.disposed = true;
		clearTimeout(this.quiet);
		this.stop();
		this.observer.disconnect();
		document.removeEventListener("visibilitychange", this.onHidden);
		window.removeEventListener("blur", this.onHidden);
		this.canvas.removeEventListener("webglcontextlost", this.onContextLost);
		this.canvas.removeEventListener("webglcontextrestored", this.onContextRestored);
		this.sound.dispose();
		this.renderer.dispose();
	}
}
