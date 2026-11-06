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
 * terminal. The dust is a canvas on the glass, outside the curved image,
 * and repaints only while it is being wiped.
 */

type Stage = "dust" | "lit" | "clean" | "typing" | "answered" | "maximize" | "fade";
const ORDER: Stage[] = ["dust", "lit", "clean", "typing", "answered", "maximize", "fade"];
const reached = (stage: Stage, step: Stage) => ORDER.indexOf(stage) >= ORDER.indexOf(step);

type Pt = { x: number; y: number };
/** One band of the wiping hand: where it sits across the hand, how wide, how hard it presses. */
type Finger = { offset: number; width: number; strength: number };
type Glass = {
	ctx: CanvasRenderingContext2D;
	probe: CanvasRenderingContext2D | null;
	width: number;
	height: number;
	hand: number;
	/** Total dust alpha when fresh, for measuring how much has been wiped. */
	initial: number;
	measuredAt: number;
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
/** When the machine was first switched on: the first commit. */
const SINCE = Date.UTC(2026, 2, 11);

const two = (n: number) => String(n).padStart(2, "0");
const clockStamp = (d: Date) =>
	[d.getFullYear() % 100, d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()]
		.map(two)
		.join(":");
const timeOfDay = (d: Date) => `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;

function makeHand(): Finger[] {
	const n = 5 + Math.floor(Math.random() * 3);
	const fingers = Array.from({ length: n }, (_, i) => ({
		offset: (i / (n - 1) - 0.5) * 0.86 + (Math.random() - 0.5) * 0.06,
		width: 0.07 + Math.random() * 0.1,
		strength: 0.6 + Math.random() * 0.4,
	}));
	// The palm: one broad, light pass under the fingers.
	return [{ offset: 0, width: 0.9, strength: 0.42 }, ...fingers];
}

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
	const g = ctx.createRadialGradient(x, y, 0, x, y, r);
	g.addColorStop(0, color);
	g.addColorStop(1, "rgba(0,0,0,0)");
	ctx.fillStyle = g;
	ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

/** Years of settled dust: a warm film, room light, smudges, grain and stray fibres. */
function paintDust(ctx: CanvasRenderingContext2D, w: number, h: number) {
	const r = Math.random;
	const big = Math.max(w, h);
	ctx.fillStyle = "rgba(64, 58, 50, 0.76)";
	ctx.fillRect(0, 0, w, h);
	// A warm lamp low on the right, a cooler spill from the top left.
	glow(ctx, w * 0.8, h * 1.04, big * 0.8, "rgba(138, 106, 68, 0.4)");
	glow(ctx, w * 0.1, h * 0.02, big * 0.55, "rgba(92, 98, 104, 0.16)");
	for (let i = 0; i < 20; i++) {
		glow(
			ctx,
			r() * w,
			r() * h,
			(0.04 + r() * 0.13) * big,
			r() < 0.5
				? `rgba(26, 23, 20, ${0.1 + r() * 0.16})`
				: `rgba(124, 112, 96, ${0.05 + r() * 0.1})`,
		);
	}
	// Grain at half resolution, so specks land soft once scaled up.
	const gw = Math.ceil(w / 2);
	const gh = Math.ceil(h / 2);
	const grain = document.createElement("canvas");
	grain.width = gw;
	grain.height = gh;
	const gctx = grain.getContext("2d");
	if (gctx) {
		const img = gctx.createImageData(gw, gh);
		const d = img.data;
		for (let k = 0; k < d.length; k += 4) {
			const v = r();
			if (v > 0.84) {
				const l = 150 + r() * 80;
				d[k] = l;
				d[k + 1] = l * 0.93;
				d[k + 2] = l * 0.82;
				d[k + 3] = (v - 0.84) * 520;
			} else if (v < 0.09) {
				d[k] = 12;
				d[k + 1] = 10;
				d[k + 2] = 8;
				d[k + 3] = v * 900;
			}
		}
		gctx.putImageData(img, 0, 0);
		ctx.drawImage(grain, 0, 0, w, h);
	}
	// Fibres and hairline scratches.
	ctx.lineCap = "round";
	for (let i = 0; i < 40; i++) {
		const x = r() * w;
		const y = r() * h;
		const len = 16 + r() * 150;
		const a = r() * Math.PI * 2;
		ctx.strokeStyle = `rgba(176, 164, 146, ${0.04 + r() * 0.09})`;
		ctx.lineWidth = 0.5 + r() * 0.8;
		ctx.beginPath();
		ctx.moveTo(x, y);
		ctx.quadraticCurveTo(
			x + Math.cos(a + 0.6) * len * 0.6,
			y + Math.sin(a + 0.6) * len * 0.6,
			x + Math.cos(a) * len,
			y + Math.sin(a) * len,
		);
		ctx.stroke();
	}
}

function dustLeft(glass: Glass, source: HTMLCanvasElement) {
	const p = glass.probe;
	if (!p) return 0;
	p.clearRect(0, 0, PROBE_W, PROBE_H);
	p.drawImage(source, 0, 0, PROBE_W, PROBE_H);
	const data = p.getImageData(0, 0, PROBE_W, PROBE_H).data;
	let sum = 0;
	for (let k = 3; k < data.length; k += 4) sum += data[k] ?? 0;
	return sum;
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
	const canvas = useRef<HTMLCanvasElement>(null);
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
		const el = canvas.current;
		if (!g || !el || !g.initial) return;
		g.measuredAt = performance.now();
		advance(1 - dustLeft(g, el) / g.initial);
	}, [advance]);

	/** Drag the hand from a to b: each finger clears a band, the palm thins the dust between. */
	const wipe = useCallback(
		(a: Pt, b: Pt, fingers: Finger[], scale = 1) => {
			const g = glass.current;
			if (!g) return;
			const dx = b.x - a.x;
			const dy = b.y - a.y;
			const len = Math.hypot(dx, dy);
			if (len < 0.5) return;
			const nx = -dy / len;
			const ny = dx / len;
			const hand = g.hand * scale;
			const { ctx } = g;
			ctx.globalCompositeOperation = "destination-out";
			ctx.lineCap = "round";
			for (const f of fingers) {
				const ox = nx * f.offset * hand;
				const oy = ny * f.offset * hand;
				for (const [widen, pressure] of [
					[1.7, 0.35],
					[1, 1],
				] as const) {
					ctx.strokeStyle = `rgba(0,0,0,${f.strength * pressure})`;
					ctx.lineWidth = f.width * hand * widen;
					ctx.beginPath();
					ctx.moveTo(a.x + ox, a.y + oy);
					ctx.lineTo(b.x + ox, b.y + oy);
					ctx.stroke();
				}
			}
			ctx.globalCompositeOperation = "source-over";
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
		let last: Pt = { x: 0, y: 0 };
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
				const eased = f * f * (3 - 2 * f);
				const along = a.dir > 0 ? eased : 1 - eased;
				const p = {
					x: (-0.1 + 1.2 * along) * g.width,
					y: (a.y - 0.16 * Math.sin(Math.PI * along)) * g.height,
				};
				if (i !== arc) arc = i;
				else wipe(last, p, a.hand, 1.45);
				last = p;
			}
			raf.current = requestAnimationFrame(frame);
		};
		raf.current = requestAnimationFrame(frame);
	}, [wipe]);

	// Lay the dust before the first paint.
	useLayoutEffect(() => {
		const el = canvas.current;
		const box = root.current;
		if (!el || !box) return;
		const { width, height } = box.getBoundingClientRect();
		const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
		el.width = Math.round(width * dpr);
		el.height = Math.round(height * dpr);
		const ctx = el.getContext("2d");
		if (!ctx) return;
		ctx.scale(dpr, dpr);
		paintDust(ctx, width, height);
		const probe = document.createElement("canvas");
		probe.width = PROBE_W;
		probe.height = PROBE_H;
		const g: Glass = {
			ctx,
			probe: probe.getContext("2d", { willReadFrequently: true }),
			width,
			height,
			hand: Math.min(240, Math.max(84, Math.min(width, height) * 0.22)),
			initial: 0,
			measuredAt: 0,
		};
		g.initial = dustLeft(g, el);
		glass.current = g;
		return () => cancelAnimationFrame(raf.current);
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
				<canvas
					ref={canvas}
					className={`intro-dust ${reached(stage, "clean") ? "intro-dust-clear" : ""}`}
				/>
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
