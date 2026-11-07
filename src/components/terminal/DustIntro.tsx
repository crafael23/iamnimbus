"use client";

import {
	type CSSProperties,
	type ReactNode,
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";

/**
 * The first visit of a session opens on a machine nobody has touched in a
 * long time: a dark tube under a film of dust, with only the clock still
 * running behind it. A hand sweeps across the glass; once enough is clean
 * the screen wakes and its windows light up under the remaining dust. The
 * hand keeps wiping, flat now, over whatever is still dusty until the whole
 * glass is clean. Then `whoami` is typed into the session window, the
 * machine answers `nimbus`, and that window opens out into the terminal
 * where the chat begins.
 *
 * It plays by itself. Any key, or the skip button, goes straight to the
 * terminal.
 *
 * The glass is built the way a dusty screen looks on film. The dust is a
 * dense, matte film. The screen's light scatters through it, so under dust
 * the windows are soft patches of glow (a blurred copy of them, masked by the
 * dust itself) and only clean glass shows them sharp. Fingers leave dark,
 * dry-brushed strokes that taper where each finger lands and lifts, with dust
 * left between them, and the faint smears they leave stay on the glass after
 * the dust is gone. Nothing animates forever: the canvases repaint only while
 * the hand moves.
 */

type Stage = "dust" | "lit" | "clean" | "typing" | "answered" | "maximize" | "fade";
const ORDER: Stage[] = ["dust", "lit", "clean", "typing", "answered", "maximize", "fade"];
const reached = (stage: Stage, step: Stage) => ORDER.indexOf(stage) >= ORDER.indexOf(step);

type Pt = { x: number; y: number };
/** One line of a finger's print: where it sits across the finger (-1..1) and how wide it is. */
type Bristle = { offset: number; width: number; seed: number };
/**
 * A finger: where it sits across the hand (in hand widths), how wide it is,
 * and when it presses on the glass (t0 to t1 of the sweep). Its contact
 * narrows from the edges as it lands and lifts, which tapers its stroke.
 */
type Finger = { offset: number; width: number; t0: number; t1: number; wave: number; bristles: Bristle[] };
/** One pass of the hand across the glass, with the path it bows along. */
type Pass = {
	y: number;
	dir: number;
	hand: Finger[];
	bow: number;
	tilt: number;
	from: number;
	to: number;
	/** Hand size, in hand widths. */
	scale: number;
	ms: number;
	lift: number;
	/** Fingertips leave a faint smear; the flat of the hand does not. */
	smear: boolean;
};
type Glass = {
	film: CanvasRenderingContext2D;
	residue: CanvasRenderingContext2D | null;
	probe: CanvasRenderingContext2D | null;
	mask: CanvasRenderingContext2D | null;
	/** The sharp screen, shown only where the glass is clean. */
	sharp: HTMLDivElement | null;
	/** The blurred screen, shown only where dust is left. */
	haze: HTMLDivElement | null;
	/** Set once the glass is clean: masks are no longer updated. */
	done: boolean;
	width: number;
	height: number;
	hand: number;
	/** Total dust alpha when fresh, for measuring how much has been wiped. */
	initial: number;
	measuredAt: number;
	maskBusy: boolean;
	maskUrls: string[];
};

/** Share of the dust wiped before the screen wakes. */
const WAKE_AT = 0.12;
/** How long the dusty clock sits before the hand arrives. */
const DORMANT_MS = 1500;
/** Each sweep of the fingers, and the pause while the hand lifts for the next. */
const SWEEP_MS = 620;
const LIFT_MS = 150;
/** Where the fingers cross the glass: through the clock first. */
const SWEEPS = [0.52, 0.27, 0.8];
/** The flat of the hand is quicker: it is cleaning now, not discovering. */
const PALM_MS = 420;
const PALM_LIFT_MS = 70;
/** The band the flat of the hand clears for sure, as a share of the screen's height (at least). */
const PALM_BAND = 0.28;
/** The glass is clean once no patch of it is dustier than this (alpha out of 255). */
const CLEAN_CELL = 6;
/** In case a speck in a corner escapes the hand, it stops after this many passes. */
const MAX_PALMS = 9;
const COMMAND = "whoami";
const PROBE_W = 48;
const PROBE_H = 27;
/**
 * Pixels in the dust masks: fine enough to follow a finger, coarse enough to
 * encode fast. Shaped like the screen, so portrait phones get the same detail.
 */
const MASK_AREA = 384 * 216;
/** When the machine was first switched on: the first commit. */
const SINCE = Date.UTC(2026, 2, 11);

/** Settled dust under a dim room light: a warm khaki. */
const DUST = [104, 92, 66] as const;

const two = (n: number) => String(n).padStart(2, "0");
const clockStamp = (d: Date) =>
	[d.getFullYear() % 100, d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()]
		.map(two)
		.join(":");
const timeOfDay = (d: Date) => `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** A stable 0..1 hash, so a bristle frays the same way on every frame. */
const hash = (x: number) => {
	const s = Math.sin(x * 12.9898) * 43758.5453;
	return s - Math.floor(s);
};

/**
 * Four or five fingers, spread with gaps between them. The outer fingers
 * land a little later and lift a little earlier.
 */
function makeHand(): Finger[] {
	const r = Math.random;
	const n = r() < 0.5 ? 4 : 5;
	return Array.from({ length: n }, (_, i) => {
		const offset = (i / (n - 1) - 0.5) * 0.8 + (r() - 0.5) * 0.05;
		const edge = Math.abs(offset) * 2;
		return {
			offset,
			width: 0.13 + r() * 0.06,
			t0: 0.02 + r() * 0.08 + edge * 0.1,
			t1: 0.8 + r() * 0.16 - edge * 0.12,
			wave: r() * Math.PI * 2,
			bristles: Array.from({ length: 26 }, () => ({
				offset: (r() * 2 - 1) * (0.8 + r() * 0.2),
				width: 0.05 + r() * 0.09,
				seed: r() * 1000,
			})),
		};
	});
}

/**
 * The flat of the hand: fingers closed, one broad contact. Its lines are
 * laid side by side with no gaps, so it clears a solid band with frayed edges.
 */
function makePalm(): Finger[] {
	const r = Math.random;
	const n = 40;
	return [
		{
			offset: 0,
			width: 1,
			// Already pressing as it enters the screen, still pressing as it leaves.
			t0: -0.1,
			t1: 1.1,
			wave: r() * Math.PI * 2,
			bristles: Array.from({ length: n }, (_, i) => ({
				offset: -1 + ((i + r()) / n) * 2,
				width: 0.05 + r() * 0.04,
				seed: r() * 1000,
			})),
		},
	];
}

/** Smooth 1D noise in 0..1. */
function vnoise(x: number) {
	const i = Math.floor(x);
	return hash(i) + (hash(i + 1) - hash(i)) * smooth(x - i);
}

/** How hard a finger presses at this point of the sweep, 0..1. */
const pressure = (f: Finger, u: number) =>
	smooth(clamp01((u - f.t0) / 0.12)) * smooth(clamp01((f.t1 - u) / 0.22));

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
	const g = ctx.createRadialGradient(x, y, 0, x, y, r);
	g.addColorStop(0, color);
	g.addColorStop(1, "rgba(0,0,0,0)");
	ctx.fillStyle = g;
	ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

/** A smooth random field in 0..1: four octaves of value noise. */
function noiseField(w: number, h: number) {
	const out = new Float32Array(w * h);
	let amp = 1;
	let total = 0;
	for (const cells of [3, 6, 12, 24]) {
		const gx = cells + 2;
		const gy = Math.ceil((cells * h) / w) + 2;
		const grid = Float32Array.from({ length: gx * gy }, Math.random);
		for (let y = 0; y < h; y++) {
			const fy = (y / h) * (gy - 2);
			const y0 = Math.floor(fy);
			const sy = smooth(fy - y0);
			for (let x = 0; x < w; x++) {
				const fx = (x / w) * (gx - 2);
				const x0 = Math.floor(fx);
				const sx = smooth(fx - x0);
				const i = y0 * gx + x0;
				const top = grid[i] + (grid[i + 1] - grid[i]) * sx;
				const bottom = grid[i + gx] + (grid[i + gx + 1] - grid[i + gx]) * sx;
				out[y * w + x] += amp * (top + (bottom - top) * sy);
			}
		}
		total += amp;
		amp *= 0.5;
	}
	for (let i = 0; i < out.length; i++) out[i] /= total;
	return out;
}

/** Fine grain at device pixels: a random tile, too fine to show its repeat. */
function grainTile(ctx: CanvasRenderingContext2D) {
	const size = 256;
	const c = document.createElement("canvas");
	c.width = size;
	c.height = size;
	const g = c.getContext("2d");
	if (!g) return null;
	const img = g.createImageData(size, size);
	for (let k = 0; k < img.data.length; k += 4) {
		const v = Math.random();
		const light = v > 0.5;
		img.data[k] = img.data[k + 1] = img.data[k + 2] = light ? 255 : 0;
		img.data[k + 3] = Math.abs(v - 0.5) * 2 * (light ? 34 : 46);
	}
	g.putImageData(img, 0, 0);
	return ctx.createPattern(c, "repeat");
}

/**
 * Years of settled dust: a dense matte film, a little uneven and thicker
 * toward the bezel, lit from the room on the right, with fine grain, grime,
 * the odd hair, and the ghost of a wipe from long ago.
 */
function paintFilm(ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number) {
	const r = Math.random;
	const big = Math.max(w, h);
	const fw = 160;
	const fh = Math.max(2, Math.round((fw * h) / w));
	const field = noiseField(fw, fh);
	const img = new ImageData(fw, fh);
	for (let y = 0; y < fh; y++) {
		for (let x = 0; x < fw; x++) {
			const i = y * fw + x;
			const edge = Math.max(Math.abs((x + 0.5) / fw - 0.5), Math.abs((y + 0.5) / fh - 0.5)) * 2;
			const d = clamp01(0.86 + (field[i] - 0.5) * 0.4 + 0.1 * smooth(clamp01((edge - 0.7) / 0.3)));
			const k = i * 4;
			// Thicker dust is a touch lighter: it scatters more of the room's light.
			const lift = 0.9 + 0.2 * field[i];
			img.data[k] = DUST[0] * lift;
			img.data[k + 1] = DUST[1] * lift;
			img.data[k + 2] = DUST[2] * lift;
			img.data[k + 3] = d * 255;
		}
	}
	const small = document.createElement("canvas");
	small.width = fw;
	small.height = fh;
	small.getContext("2d")?.putImageData(img, 0, 0);
	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = "high";
	ctx.drawImage(small, 0, 0, w, h);

	// Light falls on the dust from the room, low on the right; the far corner is dim.
	ctx.globalCompositeOperation = "source-atop";
	glow(ctx, w * 0.86, h * 1.05, big * 0.85, "rgba(214, 182, 128, 0.32)");
	glow(ctx, w * 0.05, h * -0.05, big * 0.7, "rgba(0, 0, 0, 0.32)");
	// Grime: soft, uneven patches.
	for (let i = 0; i < 26; i++) {
		glow(
			ctx,
			r() * w,
			r() * h,
			(0.03 + r() * 0.12) * big,
			r() < 0.6 ? `rgba(20, 16, 10, ${0.06 + r() * 0.1})` : `rgba(190, 170, 130, ${0.04 + r() * 0.06})`,
		);
	}
	// Grain at device pixels.
	const grain = grainTile(ctx);
	if (grain) {
		ctx.save();
		ctx.scale(1 / dpr, 1 / dpr);
		ctx.fillStyle = grain;
		ctx.fillRect(0, 0, w * dpr, h * dpr);
		ctx.restore();
	}
	ctx.globalCompositeOperation = "source-over";

	// Hairs and the few grains large enough to see.
	ctx.lineCap = "round";
	for (let i = 0; i < 9; i++) {
		const x = r() * w;
		const y = r() * h;
		const len = 20 + r() * 80;
		const a = r() * Math.PI * 2;
		const bend = (r() - 0.5) * 1.8;
		ctx.strokeStyle = `rgba(36, 30, 22, ${0.35 + r() * 0.3})`;
		ctx.lineWidth = 0.5 + r() * 0.5;
		ctx.beginPath();
		ctx.moveTo(x, y);
		ctx.quadraticCurveTo(
			x + Math.cos(a + bend) * len * 0.6,
			y + Math.sin(a + bend) * len * 0.6,
			x + Math.cos(a) * len,
			y + Math.sin(a) * len,
		);
		ctx.stroke();
	}
	for (let i = 0; i < Math.round((w * h) / 9000); i++) {
		ctx.fillStyle = r() < 0.7 ? `rgba(40, 33, 24, ${0.3 + r() * 0.4})` : `rgba(200, 186, 156, ${0.2 + r() * 0.3})`;
		const s = 0.6 + r() * r() * 1.6;
		ctx.fillRect(r() * w, r() * h, s, s);
	}

	// Someone wiped it once, long ago: a lighter arc where the dust is thinner.
	ctx.globalCompositeOperation = "destination-out";
	for (let i = 0; i < 2; i++) {
		const y = (0.25 + r() * 0.55) * h;
		ctx.strokeStyle = "rgba(0,0,0,0.09)";
		ctx.lineWidth = big * (0.05 + r() * 0.05);
		ctx.beginPath();
		ctx.moveTo(-0.1 * w, y);
		ctx.quadraticCurveTo(w * (0.3 + r() * 0.4), y - h * (0.12 + r() * 0.12), w * 1.1, y + h * (r() - 0.5) * 0.2);
		ctx.stroke();
	}
	ctx.globalCompositeOperation = "source-over";
}

/** The dust on the glass, averaged into a coarse grid (RGBA; alpha is the dust). */
function probeDust(glass: Glass) {
	const p = glass.probe;
	if (!p) return null;
	p.clearRect(0, 0, PROBE_W, PROBE_H);
	p.drawImage(glass.film.canvas, 0, 0, PROBE_W, PROBE_H);
	return p.getImageData(0, 0, PROBE_W, PROBE_H).data;
}

function dustLeft(glass: Glass) {
	const data = probeDust(glass);
	if (!data) return 0;
	let sum = 0;
	for (let k = 3; k < data.length; k += 4) sum += data[k];
	return sum;
}

/** Where a pass is at a point across the screen (0..1), as a share of its height. */
const pathY = (p: Pick<Pass, "y" | "bow" | "tilt">, along: number) =>
	p.y - p.bow * Math.sin(Math.PI * along) + p.tilt * (along - 0.5);

/**
 * The next pass of the flat hand: through the dustiest band left, or none
 * once the glass is clean.
 */
function nextPalm(glass: Glass, dir: number): Pass | null {
	const d = probeDust(glass);
	if (!d) return null;
	let worst = 0;
	for (let k = 3; k < d.length; k += 4) if (d[k] > worst) worst = d[k];
	if (worst < CLEAN_CELL) return null;
	const r = Math.random;
	// The hand's solid core is about 70% of its width; aim with that.
	const scale = Math.max(1.5, (PALM_BAND * glass.height) / (0.7 * glass.hand));
	const half = (0.33 * glass.hand * scale) / glass.height;
	const shape = {
		dir,
		bow: 0.03 + r() * 0.05,
		tilt: (r() - 0.5) * 0.08,
		// Far enough past both edges that the trailing edges of the hand clear the corners too.
		from: -0.2 + r() * 0.04,
		to: 1.16 + r() * 0.04,
	};
	const bands: { y: number; score: number }[] = [];
	for (let y = -0.04; y <= 1.04; y += 0.02) {
		let score = 0;
		for (let cx = 0; cx < PROBE_W; cx++) {
			const py = pathY({ ...shape, y }, ((cx + 0.5) / PROBE_W - shape.from) / (shape.to - shape.from));
			for (let cy = 0; cy < PROBE_H; cy++) {
				if (Math.abs((cy + 0.5) / PROBE_H - py) < half) score += d[(cy * PROBE_W + cx) * 4 + 3];
			}
		}
		bands.push({ y, score });
	}
	// Work down the glass the way a person would, top to bottom, skipping
	// bands that are already clean, rather than jumping to the worst one.
	const best = Math.max(...bands.map((b) => b.score));
	const y = bands.find((b) => b.score >= best * 0.5)?.y ?? 0.5;
	return { ...shape, y, hand: makePalm(), scale, ms: PALM_MS, lift: PALM_LIFT_MS, smear: false };
}

const toUrl = (canvas: HTMLCanvasElement) =>
	new Promise<string | null>((resolve) =>
		canvas.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : null)),
	);

function setMask(el: HTMLElement, url: string) {
	el.style.setProperty("mask-image", `url(${url})`);
	el.style.setProperty("-webkit-mask-image", `url(${url})`);
}

/**
 * Under dust the screen is seen only as scattered light; through clean glass
 * it is sharp. Two masks from the film's alpha (saturated, so any dust counts
 * in full) split the screen between a blurred copy and the sharp original.
 * Encoding is asynchronous and one at a time, so a slow encode never stacks.
 * (A masked backdrop-filter would be simpler, but Chrome ignores the mask.)
 */
function updateHaze(glass: Glass) {
	const { mask, haze, sharp } = glass;
	if (!mask || !haze || !sharp || glass.maskBusy || glass.done) return;
	const dust = mask.canvas;
	const { width: mw, height: mh } = dust;
	mask.globalCompositeOperation = "copy";
	mask.drawImage(glass.film.canvas, 0, 0, mw, mh);
	mask.globalCompositeOperation = "lighter";
	mask.drawImage(dust, 0, 0);
	const clean = document.createElement("canvas");
	clean.width = mw;
	clean.height = mh;
	const cctx = clean.getContext("2d");
	if (!cctx) return;
	cctx.fillStyle = "#000";
	cctx.fillRect(0, 0, mw, mh);
	cctx.globalCompositeOperation = "destination-out";
	cctx.drawImage(dust, 0, 0);
	glass.maskBusy = true;
	void Promise.all([toUrl(dust), toUrl(clean)]).then(([dustUrl, cleanUrl]) => {
		glass.maskBusy = false;
		if (!dustUrl || !cleanUrl || glass.done) return;
		setMask(haze, dustUrl);
		setMask(sharp, cleanUrl);
		const old = glass.maskUrls;
		// Let the new masks decode before the old ones go.
		window.setTimeout(() => old.forEach((u) => URL.revokeObjectURL(u)), 500);
		glass.maskUrls = [dustUrl, cleanUrl];
	});
}

function sizeCanvas(el: HTMLCanvasElement, w: number, h: number, dpr: number) {
	el.width = Math.round(w * dpr);
	el.height = Math.round(h * dpr);
	const ctx = el.getContext("2d");
	ctx?.scale(dpr, dpr);
	return ctx;
}

export function DustIntro({ onReveal }: { onReveal: () => void }) {
	const [stage, setStage] = useState<Stage>("dust");
	const [gone, setGone] = useState(false);
	const [now, setNow] = useState(() => new Date());
	const [typed, setTyped] = useState(0);
	// The windows bend with the rest of the tube when the tube is curved.
	const [curved] = useState(() => Boolean(document.getElementById("crt-curve")));
	const [burstDone, setBurstDone] = useState(false);
	const [landing, setLanding] = useState<CSSProperties | null>(null);

	const root = useRef<HTMLDivElement>(null);
	const filmEl = useRef<HTMLCanvasElement>(null);
	const residueEl = useRef<HTMLCanvasElement>(null);
	const hazeEl = useRef<HTMLDivElement>(null);
	const sharpEl = useRef<HTMLDivElement>(null);
	const glass = useRef<Glass | null>(null);
	const raf = useRef(0);
	const revealed = useRef(false);

	const reveal = useCallback(() => {
		if (revealed.current) return;
		revealed.current = true;
		onReveal();
	}, [onReveal]);

	const finish = useCallback(() => {
		cancelAnimationFrame(raf.current);
		reveal();
		setStage("fade");
	}, [reveal]);

	const advance = useCallback((wiped: number) => {
		if (wiped >= WAKE_AT) setStage((s) => (s === "dust" ? "lit" : s));
	}, []);

	const measure = useCallback(() => {
		const g = glass.current;
		if (!g || !g.initial) return;
		g.measuredAt = performance.now();
		updateHaze(g);
		advance(1 - dustLeft(g) / g.initial);
	}, [advance]);

	/**
	 * Move the hand from a to b, `u0`→`u1` of the way through its sweep, in
	 * steps of a few pixels. A line of a finger is on the glass while it lies
	 * inside the finger's contact, which narrows with pressure, so strokes
	 * taper to a point. Lines near the edge of the contact skip in long runs,
	 * which frays the edges like a dry brush. Every line on the glass clears
	 * it fully: the strokes are near black. A few leave a faint smear.
	 */
	const wipe = useCallback(
		(a: Pt, b: Pt, u0: number, u1: number, fingers: Finger[], scale: number, from: Pt | null, smears: boolean) => {
			const g = glass.current;
			if (!g) return null;
			const dx = b.x - a.x;
			const dy = b.y - a.y;
			const len = Math.hypot(dx, dy);
			if (len < 0.5) return from;
			const nx = -dy / len;
			const ny = dx / len;
			// Turn the hand smoothly from the last frame's heading to this one's,
			// or its outer fingers jump on tight curves and leave gaps.
			const n0 = from ?? { x: nx, y: ny };
			const hand = g.hand * scale;
			const steps = Math.max(1, Math.ceil(len / 3));
			const { film, residue } = g;
			// Full removal with round ends: overlaps between runs and frames
			// clear nothing twice, so they leave no seams.
			film.globalCompositeOperation = "destination-out";
			film.lineCap = "round";
			film.lineJoin = "round";
			film.strokeStyle = "#000";
			if (residue) {
				residue.lineCap = "round";
				residue.strokeStyle = `rgba(${DUST.join(",")}, 0.045)`;
			}
			for (const f of fingers) {
				if (u1 < f.t0 || u0 > f.t1) continue;
				const fw = f.width * hand;
				for (const s of f.bristles) {
					const smear = smears && residue && s.seed % 6 < 1;
					let run = 0;
					const flush = () => {
						if (!run) return;
						film.stroke();
						if (smear) residue.stroke();
						run = 0;
					};
					for (let k = 0; k <= steps; k++) {
						const t = k / steps;
						const u = u0 + (u1 - u0) * t;
						// The contact patch shrinks as the finger lifts: every line draws
						// in toward the middle and thins, so the stroke narrows smoothly.
						const contact = pressure(f, u);
						const edge = Math.abs(s.offset);
						// Only the outer lines run dry, and more so under light pressure.
						const dry = Math.max(0, edge - 0.55) / 0.45 + (1 - contact) * 0.3;
						const on = contact > 0.04 && vnoise(s.seed + u * 14) >= dry * dry * 0.85;
						if (!on) {
							flush();
							continue;
						}
						// Fingers are never quite parallel: each drifts a little across the sweep.
						const off = (f.offset + 0.025 * Math.sin(u * 4 + f.wave)) * hand + s.offset * fw * 0.5 * contact;
						const hx = n0.x + (nx - n0.x) * t;
						const hy = n0.y + (ny - n0.y) * t;
						const hl = Math.hypot(hx, hy) || 1;
						// A fingertip is round: its outer lines trail its middle.
						const lag = s.offset * s.offset * fw * 0.45;
						const x = a.x + dx * t + (hx / hl) * off - (dx / len) * lag;
						const y = a.y + dy * t + (hy / hl) * off - (dy / len) * lag;
						if (!run) {
							film.lineWidth = Math.max(0.8, s.width * fw * (0.4 + 0.6 * contact));
							film.beginPath();
							film.moveTo(x, y);
							if (smear) {
								residue.lineWidth = film.lineWidth * 0.6;
								residue.beginPath();
								residue.moveTo(x, y);
							}
						}
						film.lineTo(x, y);
						if (smear) residue.lineTo(x, y);
						run++;
					}
					flush();
				}
			}
			film.globalCompositeOperation = "source-over";
			if (performance.now() - g.measuredAt > 110) measure();
			return { x: nx, y: ny };
		},
		[measure],
	);

	/**
	 * Broad arcing sweeps of the fingers across the glass, like a forearm
	 * clearing a desk, then passes of the flat hand over whatever dust is
	 * left, back and forth, until the glass is clean.
	 */
	const sweep = useCallback(() => {
		const g = glass.current;
		if (!g) {
			setStage("clean");
			return;
		}
		// No two sweeps alike: each arcs, tilts and reaches a little differently.
		const passes: Pass[] = SWEEPS.map((y, i) => ({
			y,
			dir: i % 2 ? -1 : 1,
			hand: makeHand(),
			bow: 0.12 + Math.random() * 0.1,
			tilt: (Math.random() - 0.5) * 0.12,
			from: -0.14 + Math.random() * 0.12,
			to: 1.02 + Math.random() * 0.12,
			scale: 1.5,
			ms: SWEEP_MS,
			lift: LIFT_MS,
			smear: true,
		}));
		let i = 0;
		let start = performance.now();
		let palms = 0;
		let heading: Pt | null = null;
		let last: { p: Pt; u: number } | null = null;
		const frame = (t: number) => {
			// A frame's timestamp can precede the call that scheduled it.
			let elapsed = Math.max(0, t - start);
			if (elapsed >= passes[i].ms + passes[i].lift) {
				const prev = passes[i];
				const next = passes[i + 1] ?? (palms < MAX_PALMS ? nextPalm(g, -prev.dir) : null);
				if (!next) {
					measure();
					setStage((s) => (reached(s, "clean") ? s : "clean"));
					return;
				}
				if (!passes[i + 1]) {
					palms++;
					passes.push(next);
				}
				i++;
				start = t;
				elapsed = 0;
				heading = null;
				last = null;
			}
			const a = passes[i];
			// Ease in and out, as an arm would.
			const u = smooth(Math.min(1, elapsed / a.ms));
			const along = a.dir > 0 ? u : 1 - u;
			const p = { x: (a.from + (a.to - a.from) * along) * g.width, y: pathY(a, along) * g.height };
			if (last && last.u < 1) heading = wipe(last.p, p, last.u, u, a.hand, a.scale, heading, a.smear);
			last = { p, u };
			raf.current = requestAnimationFrame(frame);
		};
		raf.current = requestAnimationFrame(frame);
	}, [wipe, measure]);

	// Lay the dust before the first paint.
	useLayoutEffect(() => {
		const film = filmEl.current;
		if (!film) return;
		// The glass overhangs the tube so the camera drift never shows an edge.
		const { width, height } = film.getBoundingClientRect();
		const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
		const fctx = sizeCanvas(film, width, height, dpr);
		if (!fctx) return;
		paintFilm(fctx, width, height, dpr);
		const probe = document.createElement("canvas");
		probe.width = PROBE_W;
		probe.height = PROBE_H;
		const mask = document.createElement("canvas");
		mask.width = Math.round(Math.sqrt((MASK_AREA * width) / height));
		mask.height = Math.round(MASK_AREA / mask.width);
		const g: Glass = {
			film: fctx,
			residue: residueEl.current ? sizeCanvas(residueEl.current, width, height, dpr) : null,
			probe: probe.getContext("2d", { willReadFrequently: true }),
			mask: mask.getContext("2d"),
			sharp: sharpEl.current,
			haze: hazeEl.current,
			done: false,
			width,
			height,
			hand: Math.min(240, Math.max(84, Math.min(width, height) * 0.22)),
			initial: 0,
			measuredAt: 0,
			maskBusy: false,
			maskUrls: [],
		};
		g.initial = dustLeft(g);
		updateHaze(g);
		glass.current = g;
		return () => {
			cancelAnimationFrame(raf.current);
			for (const u of g.maskUrls) URL.revokeObjectURL(u);
		};
	}, []);

	// The clock never stopped.
	const live = stage !== "fade";
	useEffect(() => {
		if (!live) return;
		const timer = { id: 0 };
		const tick = () => {
			setNow(new Date());
			timer.id = window.setTimeout(tick, 1000 - (Date.now() % 1000));
		};
		timer.id = window.setTimeout(tick, 1000 - (Date.now() % 1000));
		return () => window.clearTimeout(timer.id);
	}, [live]);

	// The hand arrives after a moment with the dormant clock.
	useEffect(() => {
		const id = window.setTimeout(sweep, DORMANT_MS);
		return () => window.clearTimeout(id);
	}, [sweep]);

	// Once the glass is clean the sharp screen shows everywhere; the blurred
	// copy fades out over it.
	useEffect(() => {
		const g = glass.current;
		if (!reached(stage, "clean") || !g || g.done) return;
		g.done = true;
		g.sharp?.style.setProperty("mask-image", "none");
		g.sharp?.style.setProperty("-webkit-mask-image", "none");
	}, [stage]);

	// The sequence after the glass is wiped.
	useEffect(() => {
		let id = 0;
		if (stage === "clean") {
			id = window.setTimeout(() => setStage("typing"), 950);
		} else if (stage === "answered") {
			id = window.setTimeout(() => {
				// Land the window's text on the terminal's first line, so the cut is invisible.
				const target = document.getElementById("boot-whoami");
				const box = root.current;
				if (target && box) {
					const t = target.getBoundingClientRect();
					const b = box.getBoundingClientRect();
					const style = window.getComputedStyle(target);
					setLanding({
						paddingLeft: t.left - b.left,
						paddingTop: t.top - b.top,
						fontSize: style.fontSize,
						lineHeight: style.lineHeight,
					});
				}
				setStage("maximize");
			}, 1100);
		} else if (stage === "maximize") {
			id = window.setTimeout(() => {
				reveal();
				setStage("fade");
			}, 750);
		} else if (stage === "fade") {
			// In case the fade's transitionend never arrives.
			id = window.setTimeout(() => setGone(true), 900);
		}
		return () => window.clearTimeout(id);
	}, [stage, reveal]);

	// whoami, typed by a hand that has not done this in a while.
	useEffect(() => {
		if (stage !== "typing") return;
		const id =
			typed < COMMAND.length
				? window.setTimeout(() => setTyped((n) => n + 1), 85 + Math.random() * 90)
				: window.setTimeout(() => setStage("answered"), 420);
		return () => window.clearTimeout(id);
	}, [stage, typed]);

	// Any key skips to the terminal.
	useEffect(() => {
		if (stage === "fade") return;
		const onKey = (e: KeyboardEvent) => {
			if (e.metaKey || e.ctrlKey || e.altKey) return;
			if ((e.target as Element | null)?.closest?.("[data-intro-skip]")) return;
			finish();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [stage, finish]);

	if (gone) return null;

	const lit = reached(stage, "lit");
	const off = reached(stage, "maximize");
	const onGlass = stage !== "typing" && !reached(stage, "answered");
	const clear = reached(stage, "clean") ? "intro-dust-clear" : "";
	const curve = curved ? { filter: "url(#crt-curve)" } : undefined;
	const hazeStyle = { filter: `${curved ? "url(#crt-curve) " : ""}blur(10px) brightness(0.7) saturate(0.5)` };
	const windows = lit && (
					<>
						<IntroWindow
							title="top — nimbus@grid"
							className={`intro-win-top ${off ? "intro-win-off" : ""}`}
							delay={0}
						>
							<Top now={now} />
						</IntroWindow>
						<IntroWindow
							title="archive"
							className={`intro-win-archive ${off ? "intro-win-off" : ""}`}
							delay={260}
						>
							<Archive />
						</IntroWindow>
						<IntroWindow
							title="tty1"
							className={`intro-win-tty ${off ? "intro-win-max" : ""}`}
							bodyStyle={off ? (landing ?? undefined) : undefined}
							delay={520}
						>
							{reached(stage, "typing") ? (
								<>
									<p>
										<span className="text-dim">$</span> {COMMAND.slice(0, typed)}
										{stage === "typing" && <span className="cursor-block" />}
									</p>
									{reached(stage, "answered") && (
										<>
											<p className="line-in glow-text">nimbus</p>
											{!off && (
												<p>
													<span className="text-dim">$</span> <span className="cursor-block cursor-blink" />
												</p>
											)}
										</>
									)}
								</>
							) : (
								<p>
									<span className="text-dim">$</span> <span className="cursor-block cursor-blink" />
								</p>
							)}
						</IntroWindow>
					</>
				);

	return (
		<div
			ref={root}
			aria-hidden
			className={`crt-screen intro ${stage === "fade" ? "intro-out" : ""}`}
			onTransitionEnd={(e) => {
				if (e.target === e.currentTarget && e.propertyName === "opacity") setGone(true);
			}}
		>
			<div ref={sharpEl} className="intro-tube intro-tube-masked font-crt" style={curve}>
				{windows}
			</div>
			{/*
			 * Under dust the screen's light scatters: the same windows, blurred and
			 * dimmed, masked to where dust is left. Clean glass shows them sharp.
			 */}
			{onGlass && (
				<div ref={hazeEl} className={`intro-tube intro-tube-masked intro-tube-haze font-crt ${clear}`} style={hazeStyle}>
					{windows}
				</div>
			)}


			{/* The clock stays legible through the dust: it sits above the glow. */}
			<div className="intro-tube intro-tube-front font-crt" style={curve}>
				<p className={`intro-clock crt-text ${lit ? "intro-clock-out" : ""}`}>{clockStamp(now)}</p>
			</div>

			{onGlass && <canvas ref={filmEl} className={`intro-glass intro-film ${clear}`} />}
			<canvas ref={residueEl} className={`intro-glass intro-residue ${off ? "intro-dust-clear" : ""}`} />
			{onGlass && <div className={`intro-sheen ${clear}`} />}

			{lit && !burstDone && (
				<div
					className="crt-static"
					onAnimationEnd={(e) => {
						if (e.animationName === "static-burst") setBurstDone(true);
					}}
				/>
			)}

			<p className={`intro-hint font-crt ${reached(stage, "maximize") ? "intro-hint-off" : ""}`}>
				<button type="button" data-intro-skip onClick={finish} className="intro-skip">
					skip
				</button>
			</p>
		</div>
	);
}

function IntroWindow({
	title,
	className,
	bodyStyle,
	delay,
	children,
}: {
	title: string;
	className: string;
	bodyStyle?: CSSProperties;
	delay: number;
	children: ReactNode;
}) {
	return (
		<section className={`intro-win ${className}`} style={{ animationDelay: `${delay}ms` }}>
			<header className="intro-titlebar">
				<span className="intro-box" />
				<span>{title}</span>
				<span className="intro-box" />
			</header>
			<div className="intro-body crt-text" style={bodyStyle}>
				{children}
			</div>
		</section>
	);
}

/** The machine's process table: the parts of this site, still running. */
function Top({ now }: { now: Date }) {
	const days = Math.max(1, Math.floor((now.getTime() - SINCE) / 86_400_000));
	return (
		<pre className="intro-pre">
			{`top - ${timeOfDay(now)} up ${days} days,  1 user,  load average: 0.04, 0.06, 0.01
Tasks:   7 total,   1 running,   6 sleeping,   0 stopped
%Cpu(s):  0.7 us,  0.3 sy,  0.0 ni, 98.9 id,  0.1 wa

`}
			<span className="intro-row">{"  PID USER      PR  NI  %CPU  %MEM      TIME+  COMMAND"}</span>
			{`
    1 root      20   0   0.0   0.1    0:04.12  init
  214 nimbus    20   0   0.3   2.4    3:12.40  agent
  233 nimbus    20   0   0.0   1.1    0:48.02  rag-index
  241 nimbus    20   0   0.0   0.4    0:02.77  jev-gate
  258 nimbus    20   0   0.0   0.6    0:09.13  github-sync
  301 nimbus    20   0   0.0   0.2    0:00.51  phosphor
  322 nimbus    20   0   0.0   0.1    0:00.00  tty1`}
		</pre>
	);
}

/** What the archive holds, so the first question has somewhere to go. */
function Archive() {
	return (
		<pre className="intro-pre">
			{`$ ls -l /archive
drwxr-x---  nimbus  projects/
drwxr-x---  nimbus  writing/
drwxr-x---  nimbus  experience/
-rw-r--r--  nimbus  contact
$ `}
		</pre>
	);
}
