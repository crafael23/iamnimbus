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
 * rest is cleared, `whoami` is typed into the session window, the machine
 * answers `nimbus`, and that window opens out into the terminal where the
 * chat begins.
 *
 * It plays by itself. Any key, or the skip button, goes straight to the
 * terminal.
 *
 * The glass is built the way dust on a screen actually looks, in layers over
 * the curved image: a haze that softens the picture wherever dust remains, a
 * film that blocks the tube's light (dark specks over bright title bars), a
 * film that catches the room's light (pale specks over the dark tube), the
 * motes a wipe knocks loose, and a faint reflection on the glass itself. The
 * dust and the reflection drift a few pixels against the image while the
 * camera settles, which is what places them on the glass. Every layer is
 * still or finite: canvases repaint only while being wiped, and the motes
 * stop when the last one lands.
 */

type Stage = "dust" | "lit" | "clean" | "typing" | "answered" | "maximize" | "fade";
const ORDER: Stage[] = ["dust", "lit", "clean", "typing", "answered", "maximize", "fade"];
const reached = (stage: Stage, step: Stage) => ORDER.indexOf(stage) >= ORDER.indexOf(step);

type Pt = { x: number; y: number };
/** A line of a finger's print: fingers leave streaks, not clean bands. */
type Streak = { offset: number; width: number; strength: number };
/** One band of the wiping hand: where it sits across the hand, how wide, how hard it presses. */
type Finger = { offset: number; width: number; strength: number; streaks: Streak[] };
/** The dust a hand pushes aside piles up in a line along each of its edges. */
type Ridge = { offset: number; width: number };
type Hand = { fingers: Finger[]; ridges: Ridge[] };
type Mote = {
	x: number;
	y: number;
	vx: number;
	vy: number;
	age: number;
	life: number;
	size: number;
	alpha: number;
	/** Out of focus: in front of the glass, nearer the camera. */
	bokeh: boolean;
};
type Glass = {
	/** Dust catching the room's light. Also the one measured for coverage. */
	scatter: CanvasRenderingContext2D;
	/** Dust blocking the tube's light. */
	occlude: CanvasRenderingContext2D;
	/** Each layer as it was when the current sweep began. */
	base: { scatter: CanvasRenderingContext2D; occlude: CanvasRenderingContext2D } | null;
	probe: CanvasRenderingContext2D | null;
	mask: CanvasRenderingContext2D | null;
	veil: HTMLDivElement | null;
	motes: CanvasRenderingContext2D | null;
	sprite: HTMLCanvasElement;
	width: number;
	height: number;
	hand: number;
	/** Total dust alpha when fresh, for measuring how much has been wiped. */
	initial: number;
	measuredAt: number;
	live: Mote[];
	moteRaf: number;
	moteAt: number;
	/** Reduced motion: no floating motes. */
	calm: boolean;
};

/** Share of the dust wiped before the screen wakes. */
const WAKE_AT = 0.12;
/** How long the dusty clock sits before the hand arrives. */
const DORMANT_MS = 1500;
/** Each sweep of the hand, and the pause while it lifts for the next. */
const SWEEP_MS = 600;
const LIFT_MS = 140;
/** Where each sweep crosses the glass, top to bottom: through the clock first. */
const SWEEPS = [0.52, 0.26, 0.8, 0.03];
const COMMAND = "whoami";
const PROBE_W = 48;
const PROBE_H = 27;
/** The haze mask: coarse on purpose, it is blurred by scaling. */
const MASK_W = 160;
const MASK_H = 90;
const MAX_MOTES = 380;
/** When the machine was first switched on: the first commit. */
const SINCE = Date.UTC(2026, 2, 11);

/** Dust colours: lit film and specks, and the shadow they cast on the tube's light. */
const LIT = "214, 204, 186";
const FILM = [150, 140, 125] as const;
const SHADE = [24, 22, 19] as const;

const two = (n: number) => String(n).padStart(2, "0");
const clockStamp = (d: Date) =>
	[d.getFullYear() % 100, d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()]
		.map(two)
		.join(":");
const timeOfDay = (d: Date) => `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

function makeHand(): Hand {
	const r = Math.random;
	const n = 5 + Math.floor(r() * 3);
	const fingers = Array.from({ length: n }, (_, i) => ({
		offset: (i / (n - 1) - 0.5) * 0.86 + (r() - 0.5) * 0.06,
		width: 0.07 + r() * 0.1,
		strength: 0.78 + r() * 0.2,
		streaks: Array.from({ length: 2 }, () => ({
			offset: (r() - 0.5) * 0.6,
			width: 0.3 + r() * 0.3,
			strength: 0.6 + r() * 0.35,
		})),
	}));
	// The palm: one broad, light pass under the fingers.
	const palm = { offset: 0, width: 0.9, strength: 0.45, streaks: [] };
	const ridges = [-1, 1].map((side) => ({
		offset: side * (0.47 + (r() - 0.5) * 0.03),
		width: 0.03 * (0.7 + r() * 0.6),
	}));
	return { fingers: [palm, ...fingers], ridges };
}

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

/**
 * Years of settled dust, painted twice from one field: the light it catches
 * and the light it blocks. Thicker toward the bezel, lit by a lamp low on the
 * right, with specks of every size, a few fibres and the ghost of an old wipe.
 */
function paintDust(scatter: CanvasRenderingContext2D, occlude: CanvasRenderingContext2D, w: number, h: number) {
	const r = Math.random;
	const big = Math.max(w, h);
	const fw = 200;
	const fh = Math.max(2, Math.round((fw * h) / w));
	const field = noiseField(fw, fh);
	const density = new Float32Array(fw * fh);
	const lit = new ImageData(fw, fh);
	const shade = new ImageData(fw, fh);
	for (let y = 0; y < fh; y++) {
		for (let x = 0; x < fw; x++) {
			const i = y * fw + x;
			const edge = Math.max(Math.abs((x + 0.5) / fw - 0.5), Math.abs((y + 0.5) / fh - 0.5)) * 2;
			const d = clamp01(0.58 + (field[i] - 0.5) * 1.9 + 0.42 * smooth(clamp01((edge - 0.68) / 0.32)));
			density[i] = d;
			const k = i * 4;
			lit.data[k] = FILM[0];
			lit.data[k + 1] = FILM[1];
			lit.data[k + 2] = FILM[2];
			lit.data[k + 3] = d * 0.62 * 255;
			shade.data[k] = SHADE[0];
			shade.data[k + 1] = SHADE[1];
			shade.data[k + 2] = SHADE[2];
			shade.data[k + 3] = d * 0.5 * 255;
		}
	}
	const small = document.createElement("canvas");
	small.width = fw;
	small.height = fh;
	const sctx = small.getContext("2d");
	for (const [ctx, img] of [
		[scatter, lit],
		[occlude, shade],
	] as const) {
		if (!sctx) break;
		sctx.putImageData(img, 0, 0);
		ctx.imageSmoothingEnabled = true;
		ctx.imageSmoothingQuality = "high";
		ctx.drawImage(small, 0, 0, w, h);
	}

	// The lamp warms the dust it reaches, and only the dust.
	scatter.globalCompositeOperation = "source-atop";
	glow(scatter, w * 0.8, h * 1.04, big * 0.8, "rgba(196, 150, 96, 0.42)");
	glow(scatter, w * 0.1, h * 0.02, big * 0.55, "rgba(150, 160, 172, 0.2)");
	scatter.globalCompositeOperation = "source-over";

	// Someone wiped it once, long ago.
	for (const ctx of [scatter, occlude]) {
		ctx.globalCompositeOperation = "destination-out";
		ctx.lineCap = "round";
		for (let i = 0; i < 2; i++) {
			const y = (0.2 + r() * 0.6) * h;
			ctx.strokeStyle = "rgba(0,0,0,0.16)";
			ctx.lineWidth = big * (0.08 + r() * 0.06);
			ctx.beginPath();
			ctx.moveTo(-0.1 * w, y);
			ctx.quadraticCurveTo(w * (0.3 + r() * 0.4), y - h * (0.1 + r() * 0.15), w * 1.1, y + h * (r() - 0.5) * 0.2);
			ctx.stroke();
		}
		ctx.globalCompositeOperation = "source-over";
	}

	// Specks: many tiny, a few large clumps, gathered where the film is thick
	// and brightest where the light falls.
	const light = (x: number, y: number) => {
		const lamp = Math.hypot(x - w * 0.8, y - h * 1.04) / (big * 0.6);
		const spill = Math.hypot(x - w * 0.1, y) / (big * 0.4);
		return 0.4 + 0.6 * Math.exp(-lamp * lamp) + 0.25 * Math.exp(-spill * spill);
	};
	const dot = (ctx: CanvasRenderingContext2D, x: number, y: number, s: number) => {
		if (s < 0.8) {
			ctx.fillRect(x, y, s * 1.6, s * 1.6);
		} else {
			ctx.beginPath();
			ctx.arc(x, y, s, 0, Math.PI * 2);
			ctx.fill();
		}
	};
	const tries = Math.round((w * h) / 520);
	for (let i = 0; i < tries; i++) {
		const x = r() * w;
		const y = r() * h;
		const d = density[Math.min(fh - 1, Math.floor((y / h) * fh)) * fw + Math.min(fw - 1, Math.floor((x / w) * fw))];
		if (r() > 0.25 + 0.75 * d) continue;
		const size = 0.35 + 2.6 * r() ** 4;
		scatter.fillStyle = `rgba(${LIT}, ${clamp01((0.2 + r() * 0.45) * light(x, y))})`;
		occlude.fillStyle = `rgba(16, 14, 12, ${0.4 + r() * 0.4})`;
		const bits = size > 1.7 ? 3 : 1;
		for (let b = 0; b < bits; b++) {
			const bx = x + (b ? (r() - 0.5) * size * 2.4 : 0);
			const by = y + (b ? (r() - 0.5) * size * 2.4 : 0);
			const bs = b ? size * (0.4 + r() * 0.4) : size;
			dot(scatter, bx, by, bs);
			dot(occlude, bx, by, bs * 0.9);
		}
	}

	// Fibres and hairs.
	for (const ctx of [scatter, occlude]) ctx.lineCap = "round";
	for (let i = 0; i < 14; i++) {
		const x = r() * w;
		const y = r() * h;
		const len = 14 + r() * 90;
		const a = r() * Math.PI * 2;
		const bend = (r() - 0.5) * 1.6;
		const width = 0.5 + r() * 0.7;
		for (const [ctx, color] of [
			[scatter, `rgba(${LIT}, ${(0.12 + r() * 0.16) * light(x, y)})`],
			[occlude, "rgba(16, 14, 12, 0.32)"],
		] as const) {
			ctx.strokeStyle = color;
			ctx.lineWidth = width;
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
	}
}

function dustLeft(glass: Glass) {
	const p = glass.probe;
	if (!p) return 0;
	p.clearRect(0, 0, PROBE_W, PROBE_H);
	p.drawImage(glass.scatter.canvas, 0, 0, PROBE_W, PROBE_H);
	const data = p.getImageData(0, 0, PROBE_W, PROBE_H).data;
	let sum = 0;
	for (let k = 3; k < data.length; k += 4) sum += data[k];
	return sum;
}

/** The haze follows the dust: blur the image only where dust is left. */
function updateHaze(glass: Glass) {
	const { mask, veil } = glass;
	if (!mask || !veil) return;
	mask.globalCompositeOperation = "copy";
	mask.drawImage(glass.scatter.canvas, 0, 0, MASK_W, MASK_H);
	// Twice the film's alpha: a thin film already softens the picture.
	mask.globalCompositeOperation = "lighter";
	mask.drawImage(glass.scatter.canvas, 0, 0, MASK_W, MASK_H);
	const url = `url(${mask.canvas.toDataURL()})`;
	veil.style.setProperty("mask-image", url);
	veil.style.setProperty("-webkit-mask-image", url);
}

function stepMotes(g: Glass, t: number) {
	const ctx = g.motes;
	if (!ctx) return;
	const dt = Math.min(0.05, Math.max(0, t - g.moteAt) / 1000);
	g.moteAt = t;
	const drag = Math.exp(-2.6 * dt);
	ctx.clearRect(0, 0, g.width, g.height);
	g.live = g.live.filter((m) => (m.age += dt) < m.life);
	ctx.fillStyle = `rgb(${LIT})`;
	for (const m of g.live) {
		m.vx *= drag;
		m.vy = m.vy * drag + 46 * dt;
		m.x += m.vx * dt;
		m.y += m.vy * dt;
		const k = m.age / m.life;
		ctx.globalAlpha = m.alpha * Math.min(1, k * 6) * (1 - k);
		if (m.bokeh) ctx.drawImage(g.sprite, m.x - m.size, m.y - m.size, m.size * 2, m.size * 2);
		else ctx.fillRect(m.x, m.y, m.size, m.size);
	}
	ctx.globalAlpha = 1;
	g.moteRaf = g.live.length ? requestAnimationFrame((next) => stepMotes(g, next)) : 0;
}

/** Dust the hand knocks off the glass: a short drift, then it settles out of view. */
function shedMotes(g: Glass, a: Pt, b: Pt, nx: number, ny: number, hand: number) {
	if (g.calm || !g.motes || g.live.length >= MAX_MOTES) return;
	const r = Math.random;
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const n = 3 + Math.floor(r() * 4);
	for (let i = 0; i < n; i++) {
		const t = r();
		const across = (r() - 0.5) * 0.95 * hand;
		const bokeh = r() < 0.07;
		g.live.push({
			x: a.x + dx * t + nx * across,
			y: a.y + dy * t + ny * across,
			vx: dx * (2 + r() * 5) + (r() - 0.5) * 40,
			vy: dy * (2 + r() * 5) - (10 + r() * 50),
			age: 0,
			life: 0.8 + r() * 1.4,
			size: bokeh ? 2 + r() * 4 : 0.5 + r() * 1.1,
			alpha: bokeh ? 0.05 + r() * 0.08 : 0.25 + r() * 0.5,
			bokeh,
		});
	}
	if (!g.moteRaf) {
		g.moteAt = performance.now();
		g.moteRaf = requestAnimationFrame((next) => stepMotes(g, next));
	}
}

function sizeCanvas(el: HTMLCanvasElement, w: number, h: number, dpr: number) {
	el.width = Math.round(w * dpr);
	el.height = Math.round(h * dpr);
	const ctx = el.getContext("2d");
	ctx?.scale(dpr, dpr);
	return ctx;
}

function bokehSprite() {
	const c = document.createElement("canvas");
	c.width = 32;
	c.height = 32;
	const ctx = c.getContext("2d");
	if (ctx) glow(ctx, 16, 16, 16, `rgba(${LIT}, 1)`);
	return c;
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
	const scatterEl = useRef<HTMLCanvasElement>(null);
	const occludeEl = useRef<HTMLCanvasElement>(null);
	const motesEl = useRef<HTMLCanvasElement>(null);
	const veilEl = useRef<HTMLDivElement>(null);
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
	 * The current sweep so far, drawn over the glass as it was when the sweep
	 * began. One continuous stroke per line of the hand: drawing a sweep frame
	 * by frame would double up at every joint and leave seams. Each finger
	 * clears streaks, not a clean band; the palm thins the dust between; what
	 * is pushed aside piles up along both edges of the hand.
	 */
	const wipe = useCallback(
		(pts: Pt[], hand: Hand, scale = 1) => {
			const g = glass.current;
			if (!g?.base || pts.length < 2) return;
			const size = g.hand * scale;
			const normals = pts.map((_, i) => {
				const a = pts[Math.max(0, i - 1)];
				const b = pts[Math.min(pts.length - 1, i + 1)];
				const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
				return { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
			});
			const line = (ctx: CanvasRenderingContext2D, offset: number, width: number, style: string) => {
				ctx.strokeStyle = style;
				ctx.lineWidth = width;
				ctx.beginPath();
				pts.forEach((p, i) => {
					const x = p.x + normals[i].x * offset * size;
					const y = p.y + normals[i].y * offset * size;
					if (i) ctx.lineTo(x, y);
					else ctx.moveTo(x, y);
				});
				ctx.stroke();
			};
			for (const [ctx, base, pile] of [
				[g.scatter, g.base.scatter, `rgba(${FILM.join(",")}, 0.13)`],
				[g.occlude, g.base.occlude, `rgba(${SHADE.join(",")}, 0.12)`],
			] as const) {
				ctx.save();
				ctx.setTransform(1, 0, 0, 1, 0, 0);
				ctx.globalCompositeOperation = "copy";
				ctx.drawImage(base.canvas, 0, 0);
				ctx.restore();
				ctx.lineCap = "round";
				ctx.lineJoin = "round";
				ctx.globalCompositeOperation = "destination-out";
				for (const f of hand.fingers) {
					line(ctx, f.offset, f.width * size * 1.3, `rgba(0,0,0,${f.strength * 0.72})`);
					for (const s of f.streaks) {
						line(ctx, f.offset + s.offset * f.width, s.width * f.width * size, `rgba(0,0,0,${s.strength * f.strength})`);
					}
				}
				ctx.globalCompositeOperation = "source-over";
				for (const ridge of hand.ridges) line(ctx, ridge.offset, ridge.width * size, pile);
			}
			const a = pts[pts.length - 2];
			const b = pts[pts.length - 1];
			const n = normals[normals.length - 1];
			shedMotes(g, a, b, n.x, n.y, size);
			if (performance.now() - g.measuredAt > 160) measure();
		},
		[measure],
	);

	/** Broad arcing sweeps across the glass, like a forearm clearing a desk. */
	const sweep = useCallback(() => {
		const g = glass.current;
		if (!g) {
			setStage("clean");
			return;
		}
		const arcs = SWEEPS.map((y, i) => ({ y, dir: i % 2 ? -1 : 1, hand: makeHand() }));
		const start = performance.now();
		const per = SWEEP_MS + LIFT_MS;
		let arc = -1;
		let pts: Pt[] = [];
		const frame = (t: number) => {
			// A frame's timestamp can precede the call that scheduled it.
			const k = Math.max(0, t - start) / per;
			const i = Math.floor(k);
			const a = arcs[i];
			if (!a) {
				setStage((s) => (reached(s, "clean") ? s : "clean"));
				return;
			}
			const f = ((k - i) * per) / SWEEP_MS;
			if (f <= 1) {
				// Ease in and out, as an arm would.
				const along = a.dir > 0 ? smooth(f) : 1 - smooth(f);
				const p = {
					x: (-0.1 + 1.2 * along) * g.width,
					y: (a.y - 0.16 * Math.sin(Math.PI * along)) * g.height,
				};
				if (i !== arc) {
					// A new sweep starts from the glass as the last one left it.
					arc = i;
					pts = [];
					if (g.base) {
						for (const [base, layer] of [
							[g.base.scatter, g.scatter],
							[g.base.occlude, g.occlude],
						] as const) {
							base.globalCompositeOperation = "copy";
							base.drawImage(layer.canvas, 0, 0);
						}
					}
				}
				pts.push(p);
				wipe(pts, a.hand, 1.45);
			}
			raf.current = requestAnimationFrame(frame);
		};
		raf.current = requestAnimationFrame(frame);
	}, [wipe]);

	// Lay the dust before the first paint.
	useLayoutEffect(() => {
		const scatter = scatterEl.current;
		const occlude = occludeEl.current;
		if (!scatter || !occlude) return;
		// The glass layers overhang the tube so the drift never shows an edge.
		const { width, height } = scatter.getBoundingClientRect();
		const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
		const sctx = sizeCanvas(scatter, width, height, dpr);
		const octx = sizeCanvas(occlude, width, height, dpr);
		if (!sctx || !octx) return;
		paintDust(sctx, octx, width, height);
		const probe = document.createElement("canvas");
		probe.width = PROBE_W;
		probe.height = PROBE_H;
		const mask = document.createElement("canvas");
		mask.width = MASK_W;
		mask.height = MASK_H;
		const copy = (ctx: CanvasRenderingContext2D) => {
			const c = document.createElement("canvas");
			c.width = ctx.canvas.width;
			c.height = ctx.canvas.height;
			return c.getContext("2d");
		};
		const baseScatter = copy(sctx);
		const baseOcclude = copy(octx);
		const g: Glass = {
			scatter: sctx,
			occlude: octx,
			base: baseScatter && baseOcclude ? { scatter: baseScatter, occlude: baseOcclude } : null,
			probe: probe.getContext("2d", { willReadFrequently: true }),
			mask: mask.getContext("2d"),
			veil: veilEl.current,
			motes: motesEl.current ? sizeCanvas(motesEl.current, width, height, 1) : null,
			sprite: bokehSprite(),
			width,
			height,
			hand: Math.min(240, Math.max(84, Math.min(width, height) * 0.22)),
			initial: 0,
			measuredAt: 0,
			live: [],
			moteRaf: 0,
			moteAt: 0,
			calm: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
		};
		g.initial = dustLeft(g);
		updateHaze(g);
		glass.current = g;
		return () => {
			cancelAnimationFrame(raf.current);
			cancelAnimationFrame(g.moteRaf);
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
	const clear = reached(stage, "clean") ? "intro-dust-clear" : "";

	return (
		<div
			ref={root}
			aria-hidden
			className={`crt-screen intro ${stage === "fade" ? "intro-out" : ""}`}
			onTransitionEnd={(e) => {
				if (e.target === e.currentTarget && e.propertyName === "opacity") setGone(true);
			}}
		>
			<div className="intro-tube font-crt" style={curved ? { filter: "url(#crt-curve)" } : undefined}>
				<p className={`intro-clock crt-text ${lit ? "intro-clock-out" : ""}`}>{clockStamp(now)}</p>
				{lit && (
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
				)}
			</div>

			{stage !== "typing" && !reached(stage, "answered") && (
				<>
					<div ref={veilEl} className={`intro-glass intro-veil ${clear}`} />
					<canvas ref={occludeEl} className={`intro-glass intro-occlude ${clear}`} />
					<canvas ref={scatterEl} className={`intro-glass intro-scatter ${clear}`} />
					<canvas ref={motesEl} className={`intro-glass intro-motes ${clear}`} />
					<div className={`intro-sheen ${clear}`} />
				</>
			)}

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
