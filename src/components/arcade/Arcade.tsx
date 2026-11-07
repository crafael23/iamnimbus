"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { Component, type PointerEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { type Dir, ENERGY_MAX, type Game, type RoundResult, WIN_BONUS } from "../../../convex/_lib/arcade/engine";
import { normalizeInitials } from "../../../convex/_lib/arcade/initials";
import { guestToken } from "../terminal/guestToken";
import { ARCADE_TITLE } from "./config";
import { CREDITS, FURTHER } from "./credits";
import { type RunResult, Session, type SessionEvents } from "./session";

type Screen = "title" | "linking" | "playing" | "paused" | "over" | "board" | "credits" | "unsupported";
type Banner = { kind: "ready"; level: number; first: boolean } | { kind: "end"; result: RoundResult; level: number };
type Over = RunResult & { runId: Id<"arcadeRuns"> | null };
type Post = "entry" | "sending" | "sent" | "skipped" | "failed";

const DIRS: Record<string, Dir> = {
	ArrowUp: 0,
	KeyW: 0,
	ArrowRight: 1,
	KeyD: 1,
	ArrowDown: 2,
	KeyS: 2,
	ArrowLeft: 3,
	KeyA: 3,
};
const BOOST_KEYS = new Set(["Space", "ShiftLeft", "ShiftRight"]);
const SWIPE_PX = 22;
const MUTE_KEY = "arcade:muted";
const INITIALS_KEY = "arcade:initials";

function load(key: string) {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}
function save(key: string, value: string) {
	try {
		localStorage.setItem(key, value);
	} catch {
		// Private mode: the preference just doesn't stick.
	}
}

const pad = (n: number, width: number) => String(n).padStart(width, "0");

/** Little-endian u32s, the format the server replays. */
function pack(inputs: Uint32Array): ArrayBuffer {
	const buf = new ArrayBuffer(inputs.length * 4);
	const view = new DataView(buf);
	for (let i = 0; i < inputs.length; i++) view.setUint32(i * 4, inputs[i]!, true);
	return buf;
}

/** Probe once, up front: the arcade needs WebGL2. */
function hasWebGL2() {
	const gl = document.createElement("canvas").getContext("webgl2");
	gl?.getExtension("WEBGL_lose_context")?.loseContext();
	return !!gl;
}

function within<T>(p: Promise<T>, ms: number): Promise<T> {
	return Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);
}

/**
 * The arcade, over the whole tube. It sits between the screen and the glass
 * (z-index under .crt-overlay), so the site's scanlines and vignette stay in
 * front of it, and it hides the terminal underneath so nothing there repaints
 * while the game runs.
 */
export default function Arcade({ onExit }: { onExit: (summary: string | null) => void }) {
	const host = useRef<HTMLDivElement>(null);
	const canvas = useRef<HTMLCanvasElement>(null);
	const session = useRef<Session | null>(null);
	const hud = useRef({ score: -1, level: -1, lives: -1, energy: -1, grind: false });
	const scoreEl = useRef<HTMLSpanElement>(null);
	const levelEl = useRef<HTMLSpanElement>(null);
	const livesEl = useRef<HTMLSpanElement>(null);
	const boostEl = useRef<HTMLSpanElement>(null);
	const grindEl = useRef<HTMLSpanElement>(null);
	const swipe = useRef<{ id: number; x: number; y: number } | null>(null);
	const best = useRef<{ score: number; level: number } | null>(null);
	const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {});
	/** The ranked run in progress, if the server issued one. */
	const runRef = useRef<Id<"arcadeRuns"> | null>(null);

	const [screen, setScreen] = useState<Screen>(() => (hasWebGL2() ? "title" : "unsupported"));
	/** Session callbacks, kept current each render. */
	const events = useRef<SessionEvents | null>(null);
	const [banner, setBanner] = useState<Banner | null>(null);
	const [muted, setMuted] = useState(() => load(MUTE_KEY) === "1");
	const [over, setOver] = useState<Over | null>(null);
	const [initials, setInitials] = useState(() => load(INITIALS_KEY) ?? "");
	const [post, setPost] = useState<Post>("entry");
	const [token, setToken] = useState<string | undefined>();
	const [exiting, setExiting] = useState(false);

	const { isAuthenticated, isLoading } = useConvexAuth();
	const startRun = useMutation(api.arcade.mutations.startRun);
	const submitRun = useMutation(api.arcade.mutations.submitRun);

	useEffect(() => {
		if (isLoading || isAuthenticated) return;
		guestToken()
			.then(setToken)
			.catch(() => {});
	}, [isAuthenticated, isLoading]);

	// Take over the tube: hide and freeze the terminal, start the title screen.
	useEffect(() => {
		const root = document.documentElement;
		const screenEl = document.querySelector(".crt-screen");
		root.dataset.arcade = "on";
		screenEl?.setAttribute("inert", "");
		(document.activeElement as HTMLElement | null)?.blur?.();
		const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		let s: Session | null = null;
		try {
			s = new Session(
				canvas.current!,
				host.current!,
				{
					hud: (g) => events.current?.hud(g),
					phase: (g) => events.current?.phase(g),
					over: (r) => events.current?.over(r),
					autoPaused: () => events.current?.autoPaused(),
				},
				{ reducedMotion, muted: load(MUTE_KEY) === "1" },
			);
			s.attract();
		} catch {
			// No usable WebGL2 after all: the "unsupported" screen covers it once a key is pressed.
			s = null;
		}
		session.current = s;
		// Dev builds expose the session for profiling from the console.
		if (process.env.NODE_ENV !== "production") (window as { __arcade?: Session | null }).__arcade = s;
		const onKey = (e: KeyboardEvent) => keyHandler.current(e);
		window.addEventListener("keydown", onKey, true);
		window.addEventListener("keyup", onKey, true);
		return () => {
			window.removeEventListener("keydown", onKey, true);
			window.removeEventListener("keyup", onKey, true);
			s?.dispose();
			session.current = null;
			if (process.env.NODE_ENV !== "production") (window as { __arcade?: Session | null }).__arcade = null;
			delete root.dataset.arcade;
			screenEl?.removeAttribute("inert");
		};
		// The session lives as long as the arcade; its callbacks only touch refs and state setters.
	}, []);

	function paintHud(g: Game) {
		const h = hud.current;
		if (g.score !== h.score && scoreEl.current) {
			h.score = g.score;
			scoreEl.current.textContent = pad(g.score, 7);
		}
		if (g.level !== h.level && levelEl.current) {
			h.level = g.level;
			levelEl.current.textContent = pad(g.level, 2);
		}
		if (g.lives !== h.lives && livesEl.current) {
			h.lives = g.lives;
			livesEl.current.textContent = "◆".repeat(Math.max(0, g.lives)) + "◇".repeat(Math.max(0, 3 - g.lives));
		}
		if (g.energy !== h.energy && boostEl.current) {
			h.energy = g.energy;
			boostEl.current.style.transform = `scaleX(${g.energy / ENERGY_MAX})`;
		}
		const grind = g.phase === "play" && !!g.cycles[0]?.alive && g.cycles[0].grinding;
		if (grind !== h.grind && grindEl.current) {
			h.grind = grind;
			grindEl.current.style.opacity = grind ? "1" : "0";
		}
	}

	function onPhase(g: Game) {
		if (g.phase === "ready") setBanner({ kind: "ready", level: g.level, first: g.round === 1 });
		else if (g.phase === "end" && g.result) setBanner({ kind: "end", result: g.result, level: g.level });
		else setBanner(null);
	}

	function onOver(r: RunResult) {
		const ranked = runRef.current;
		runRef.current = null;
		if (!best.current || r.score > best.current.score) best.current = { score: r.score, level: r.level };
		setOver({ ...r, runId: ranked });
		setPost("entry");
		setBanner(null);
		setScreen("over");
	}

	async function begin() {
		const s = session.current;
		if (!s) {
			setScreen("unsupported");
			return;
		}
		setScreen("linking");
		const layout = s.layout();
		let seed = (Math.random() * 2 ** 32) | 0;
		runRef.current = null;
		try {
			// guestToken() refreshes an expiring token; the one from mount may be hours old.
			const guest = isAuthenticated ? undefined : await within(guestToken(), 2500);
			const run = await within(startRun({ layout, guestToken: guest }), 2500);
			seed = run.seed;
			runRef.current = run.runId;
		} catch {
			// Offline or rate limited: the run still plays, it just isn't ranked.
		}
		hud.current = { score: -1, level: -1, lives: -1, energy: -1, grind: false };
		setOver(null);
		setScreen("playing");
		s.run(seed, layout);
	}

	async function send() {
		if (!over?.runId) return;
		const clean = normalizeInitials(initials);
		if (!clean) return;
		save(INITIALS_KEY, clean);
		setPost("sending");
		try {
			const guest = isAuthenticated ? undefined : await guestToken();
			await submitRun({ runId: over.runId, inputs: pack(over.inputs), initials: clean, guestToken: guest });
			setPost("sent");
		} catch {
			setPost("failed");
		}
	}

	async function leave() {
		if (exiting) return;
		setExiting(true);
		await session.current?.exit();
		const b = best.current;
		onExit(b ? `${ARCADE_TITLE.toLowerCase()}: best run ${b.score.toLocaleString("en-US")} · level ${b.level}` : null);
	}

	function toTitle() {
		setScreen("title");
		setBanner(null);
		session.current?.attract();
	}

	function toggleMute() {
		const next = !muted;
		setMuted(next);
		save(MUTE_KEY, next ? "1" : "0");
		session.current?.setMuted(next);
	}

	useEffect(() => {
		events.current = {
			hud: paintHud,
			phase: onPhase,
			over: onOver,
			autoPaused: () => setScreen((cur) => (cur === "playing" ? "paused" : cur)),
		};
	});

	// The latest key handler; the window listener above always calls this one.
	useEffect(() => {
		keyHandler.current = (e: KeyboardEvent) => {
			const s = session.current;
			if (exiting) return;
			const down = e.type === "keydown";
			const code = e.code;
			const handled = () => {
				e.preventDefault();
				e.stopPropagation();
			};
			// A boost key let go on any screen must reach the session, or the next run starts boosting.
			if (!down && BOOST_KEYS.has(code) && screen !== "playing") {
				s?.boost(false);
				return;
			}
			if (screen === "playing") {
				if (code in DIRS) {
					handled();
					if (down && !e.repeat) s?.steer(DIRS[code]!);
				} else if (BOOST_KEYS.has(code)) {
					handled();
					if (!e.repeat) s?.boost(down);
				} else if (down && (code === "Escape" || code === "KeyP")) {
					handled();
					s?.pause();
					setScreen("paused");
				} else if (down && code === "KeyM") {
					handled();
					toggleMute();
				}
				return;
			}
			if (!down) return;
			s?.poke();
			if (screen === "paused") {
				handled();
				if (code === "Enter" || code === "Escape" || code === "KeyP" || code === "Space") {
					setScreen("playing");
					s?.resume();
				} else if (code === "KeyQ") toTitle();
				else if (code === "KeyM") toggleMute();
				return;
			}
			if (screen === "over") {
				handled();
				const entering = over?.runId && over.score > 0 && (post === "entry" || post === "failed");
				if (entering) {
					if (code === "Backspace") setInitials((v) => v.slice(0, -1));
					else if (code === "Enter") void send();
					else if (code === "Escape") setPost("skipped");
					else if (/^(Key[A-Z]|Digit[0-9])$/.test(code))
						setInitials((v) => (v.length >= 3 ? v : v + code.slice(-1)).toUpperCase());
					return;
				}
				if (code === "Enter" || code === "Space") void begin();
				else if (code === "KeyL") setScreen("board");
				else if (code === "Escape") toTitle();
				return;
			}
			if (screen === "board" || screen === "credits") {
				handled();
				if (code === "Escape" || code === "Enter" || code === "KeyL" || code === "KeyC") toTitle();
				return;
			}
			if (screen === "title" || screen === "unsupported") {
				if (code === "Escape") {
					handled();
					void leave();
				} else if (screen === "title" && (code === "Enter" || code === "Space")) {
					handled();
					void begin();
				} else if (screen === "title" && code === "KeyL") {
					handled();
					setScreen("board");
				} else if (screen === "title" && code === "KeyC") {
					handled();
					setScreen("credits");
				} else if (code === "KeyM") {
					handled();
					toggleMute();
				}
			}
		};
	});

	// Swipes steer on touch screens: each 22px of travel in one direction is a turn.
	const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
		if (screen !== "playing" || e.pointerType === "mouse") return;
		swipe.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
	};
	const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
		const sw = swipe.current;
		if (!sw || sw.id !== e.pointerId) return;
		const dx = e.clientX - sw.x;
		const dy = e.clientY - sw.y;
		if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PX) return;
		session.current?.steer(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0);
		swipe.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
	};
	const onPointerUp = () => {
		swipe.current = null;
	};

	const guestArgs = isAuthenticated ? {} : token ? { guestToken: token } : {};
	const showHud = screen === "playing" || screen === "paused" || screen === "over" || screen === "linking";

	return createPortal(
		<div
			ref={host}
			className="arcade-layer font-crt text-fog select-none"
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={onPointerUp}
			onPointerCancel={onPointerUp}
			role="application"
			aria-label={`${ARCADE_TITLE}, a light-cycle game`}
		>
			<canvas ref={canvas} className="absolute inset-0 h-full w-full" />

			{showHud && (
				<div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-4 px-6 pt-4 text-[20px] sm:px-10 sm:pt-6 sm:text-[24px]">
					<div className="flex items-baseline gap-3">
						<span className="hidden text-dim sm:inline">score</span>
						<span ref={scoreEl} className="glow-amber font-display text-[15px] sm:text-[19px]">
							0000000
						</span>
						<span
							ref={grindEl}
							className="glow-amber text-[16px] opacity-0 transition-opacity duration-150 sm:text-[18px]"
						>
							×2 grind
						</span>
					</div>
					<div className="flex items-baseline gap-5">
						<span>
							<span className="text-dim">lv </span>
							<span ref={levelEl} className="glow-text">
								01
							</span>
						</span>
						<span ref={livesEl} className="glow-amber tracking-[0.2em]">
							◆◆◆
						</span>
						<span className="flex items-center gap-2">
							<span className="hidden text-dim sm:inline">boost</span>
							<span className="relative block h-2.5 w-16 overflow-hidden border border-line-strong sm:w-28">
								<span
									ref={boostEl}
									className="absolute inset-0 block origin-left bg-amber shadow-[0_0_10px_var(--color-amber)]"
								/>
							</span>
						</span>
					</div>
				</div>
			)}

			{screen === "playing" && banner && <BannerView banner={banner} />}

			{screen === "title" && (
				<Panel>
					<h1 className="glow-text text-center font-display text-[30px] leading-none tracking-[0.12em] sm:text-[56px]">
						{ARCADE_TITLE}
					</h1>
					<p className="mt-4 text-center text-[20px] text-dim sm:text-[22px]">
						light cycles in the terminal. outlast the system.
					</p>
					<div className="mt-8 flex flex-col items-center gap-3 text-[22px] sm:text-[24px]">
						<button type="button" onClick={() => void begin()} className="reverse-amber px-4 py-1">
							ENTER ride
						</button>
						<p className="text-center text-[18px] text-dim sm:text-[20px]">
							<Key>L</Key> leaderboard · <Key>C</Key> credits · <Key>M</Key> sound {muted ? "off" : "on"} ·{" "}
							<Key>ESC</Key> back to chat
						</p>
					</div>
					<Quiet>
						<Leaderboard args={guestArgs} limit={5} />
					</Quiet>
					<TouchRow>
						<TouchButton onClick={() => setScreen("board")}>board</TouchButton>
						<TouchButton onClick={() => setScreen("credits")}>credits</TouchButton>
						<TouchButton onClick={() => void leave()}>exit</TouchButton>
					</TouchRow>
				</Panel>
			)}

			{screen === "linking" && (
				<Center>
					<p className="glow-text text-[24px]">
						linking<span className="cursor-blink">_</span>
					</p>
				</Center>
			)}

			{screen === "paused" && (
				<Panel>
					<h2 className="glow-text text-center font-display text-[22px] sm:text-[30px]">PAUSED</h2>
					<p className="mt-5 text-center text-[20px] text-dim sm:text-[22px]">
						<Key>ENTER</Key> resume · <Key>Q</Key> quit run · <Key>M</Key> sound {muted ? "off" : "on"}
					</p>
					<TouchRow>
						<TouchButton
							onClick={() => {
								setScreen("playing");
								session.current?.resume();
							}}
						>
							resume
						</TouchButton>
						<TouchButton onClick={toTitle}>quit</TouchButton>
					</TouchRow>
				</Panel>
			)}

			{screen === "over" && over && (
				<Panel>
					<h2 className="glow-amber text-center font-display text-[22px] sm:text-[30px]">TRANSMISSION ENDED</h2>
					<p className="mt-5 text-center text-[22px] sm:text-[26px]">
						<span className="text-dim">score </span>
						<span className="glow-amber">{over.score.toLocaleString("en-US")}</span>
						<span className="text-dim"> · level </span>
						<span className="glow-text">{pad(over.level, 2)}</span>
					</p>
					<OverStatus over={over} post={post} initials={initials} args={guestArgs} />
					<TouchRow>
						{over.runId && over.score > 0 && (post === "entry" || post === "failed") ? (
							<>
								<input
									aria-label="Your initials"
									value={initials}
									maxLength={3}
									onChange={(e) => setInitials(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
									className="w-24 border border-line-strong bg-transparent px-2 py-1 text-center text-[22px] text-amber outline-none"
								/>
								<TouchButton onClick={() => void send()}>post</TouchButton>
								<TouchButton onClick={() => setPost("skipped")}>skip</TouchButton>
							</>
						) : (
							<>
								<TouchButton onClick={() => void begin()}>again</TouchButton>
								<TouchButton onClick={toTitle}>title</TouchButton>
							</>
						)}
					</TouchRow>
				</Panel>
			)}

			{screen === "board" && (
				<Panel>
					<h2 className="glow-text text-center font-display text-[20px] tracking-[0.1em] sm:text-[26px]">TOP RIDERS</h2>
					<Quiet fallback={<p className="mt-6 text-center text-dim">the board is offline.</p>}>
						<Leaderboard args={guestArgs} limit={10} />
					</Quiet>
					<p className="mt-6 text-center text-[18px] text-dim">
						<Key>ESC</Key> back
					</p>
					<TouchRow>
						<TouchButton onClick={toTitle}>back</TouchButton>
					</TouchRow>
				</Panel>
			)}

			{screen === "credits" && (
				<Panel wide>
					<h2 className="glow-text text-center font-display text-[20px] tracking-[0.1em] sm:text-[26px]">CREDITS</h2>
					<p className="mx-auto mt-5 max-w-[62ch] text-center text-[19px] leading-snug sm:text-[20px]">
						A light-cycle game in the line of Gremlin&apos;s <i>Blockade</i> (1976) and the light cycles of <i>TRON</i>{" "}
						(Disney, 1982) and its Bally Midway arcade game. An homage, not affiliated with either.
					</p>
					<p className="mx-auto mt-3 max-w-[62ch] text-center text-[18px] text-dim">
						Every line here is original. These open-source projects shaped the ideas:
					</p>
					<ul className="mx-auto mt-4 max-w-[70ch] space-y-1 text-[18px] leading-snug sm:text-[19px]">
						{CREDITS.map((c) => (
							<li key={c.name}>
								<a
									href={c.url}
									target="_blank"
									rel="noreferrer"
									className="text-cyan underline-offset-4 hover:underline"
								>
									{c.name}
								</a>
								<span className="text-dim"> · {c.note}</span>
							</li>
						))}
					</ul>
					<p className="mx-auto mt-3 max-w-[70ch] text-[17px] text-dim">
						also read:{" "}
						{FURTHER.map((c, i) => (
							<span key={c.name}>
								{i > 0 && " · "}
								<a href={c.url} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
									{c.name}
								</a>
							</span>
						))}
					</p>
					<p className="mt-5 text-center text-[18px] text-dim">
						<Key>ESC</Key> back
					</p>
					<TouchRow>
						<TouchButton onClick={toTitle}>back</TouchButton>
					</TouchRow>
				</Panel>
			)}

			{screen === "unsupported" && (
				<Panel>
					<p className="text-center text-[22px]">This screen can&apos;t run the arcade (it needs WebGL2).</p>
					<p className="mt-4 text-center text-[18px] text-dim">
						<Key>ESC</Key> back to chat
					</p>
					<TouchRow>
						<TouchButton onClick={() => void leave()}>back</TouchButton>
					</TouchRow>
				</Panel>
			)}

			{screen === "playing" && (
				<div className="absolute inset-x-0 bottom-0 hidden items-end justify-between px-5 pb-6 pointer-coarse:flex">
					<button
						type="button"
						className="border border-line-strong px-4 py-2 text-[20px] text-dim"
						onClick={() => {
							session.current?.pause();
							setScreen("paused");
						}}
					>
						pause
					</button>
					<button
						type="button"
						className="reverse-amber h-20 w-20 rounded-full text-[20px]"
						onPointerDown={(e) => {
							e.stopPropagation();
							session.current?.boost(true);
						}}
						onPointerUp={() => session.current?.boost(false)}
						onPointerCancel={() => session.current?.boost(false)}
						onPointerLeave={() => session.current?.boost(false)}
					>
						boost
					</button>
				</div>
			)}
		</div>,
		document.body,
	);
}

function BannerView({ banner }: { banner: Banner }) {
	if (banner.kind === "ready") {
		return (
			<Center key={`ready-${banner.level}`}>
				<p className="glow-text line-in font-display text-[26px] tracking-[0.12em] sm:text-[40px]">
					LEVEL {pad(banner.level, 2)}
				</p>
				{banner.first && (
					<p className="line-in mt-4 text-center text-[19px] text-fog sm:text-[22px]">
						<span className="pointer-coarse:hidden">
							steer <Key>←↑→↓</Key> or <Key>WASD</Key> · hold <Key>SPACE</Key> to boost ·{" "}
						</span>
						<span className="hidden pointer-coarse:inline">
							swipe to steer · hold <Key>boost</Key> ·{" "}
						</span>
						ride along walls to recharge, for double points
					</p>
				)}
			</Center>
		);
	}
	const text = banner.result === "win" ? "SECTOR CLEARED" : banner.result === "lose" ? "SIGNAL LOST" : "NULL SIGNAL";
	return (
		<Center key={`end-${banner.level}-${banner.result}`}>
			<p
				className={`line-in font-display text-[24px] tracking-[0.1em] sm:text-[36px] ${banner.result === "lose" ? "glow-amber" : "glow-text"}`}
			>
				{text}
			</p>
			<p className="line-in mt-3 text-[20px] text-fog sm:text-[22px]">
				{banner.result === "win"
					? `+${(WIN_BONUS * (banner.level - 1)).toLocaleString("en-US")}`
					: banner.result === "draw"
						? "both riders down. again."
						: ""}
			</p>
		</Center>
	);
}

function OverStatus({
	over,
	post,
	initials,
	args,
}: {
	over: Over;
	post: Post;
	initials: string;
	args: { guestToken?: string };
}) {
	if (!over.runId || over.score === 0) {
		return (
			<p className="mt-5 text-center text-[19px] text-dim">
				{over.runId ? "" : "offline run: not ranked. "}
				<Key>ENTER</Key> ride again · <Key>ESC</Key> title
			</p>
		);
	}
	if (post === "entry" || post === "failed") {
		const shown = initials.padEnd(3, "_").slice(0, 3);
		return (
			<div className="mt-6 text-center">
				<p className="text-[20px] text-fog">your initials for the board</p>
				<p className="mt-2 font-display text-[28px] tracking-[0.5em] sm:text-[34px]">
					<span className="glow-amber">{shown}</span>
				</p>
				<p className="mt-3 text-[18px] text-dim">
					{post === "failed" ? <span className="text-danger">couldn&apos;t post. </span> : null}
					type <Key>A-Z 0-9</Key> · <Key>ENTER</Key> post · <Key>ESC</Key> skip
				</p>
			</div>
		);
	}
	if (post === "skipped") {
		return (
			<p className="mt-6 text-center text-[19px] text-dim">
				not posted. <Key>ENTER</Key> ride again · <Key>L</Key> leaderboard · <Key>ESC</Key> title
			</p>
		);
	}
	if (post === "sending") {
		return (
			<p className="mt-6 text-center text-[20px] text-dim">
				sending<span className="cursor-blink">_</span>
			</p>
		);
	}
	return (
		<div className="mt-6 text-center text-[20px]">
			<Quiet fallback={<p className="text-dim">posted.</p>}>
				<RunVerdict runId={over.runId} args={args} />
			</Quiet>
			<p className="mt-4 text-[18px] text-dim">
				<Key>ENTER</Key> ride again · <Key>L</Key> leaderboard · <Key>ESC</Key> title
			</p>
		</div>
	);
}

function RunVerdict({ runId, args }: { runId: Id<"arcadeRuns">; args: { guestToken?: string } }) {
	const status = useQuery(api.arcade.queries.runStatus, { runId, ...args });
	if (!status || status.status === "open" || status.status === "verifying") {
		return (
			<p className="text-dim">
				replaying your run on the server<span className="cursor-blink">_</span>
			</p>
		);
	}
	if (status.status === "rejected") {
		return <p className="text-danger">the server&apos;s replay didn&apos;t match. not ranked.</p>;
	}
	return (
		<p>
			<span className="text-dim">verified · rank </span>
			<span className="glow-amber">#{status.rank}</span>
			<span className="text-dim"> of {status.total}</span>
			{status.personalBest && <span className="glow-text"> · new best</span>}
		</p>
	);
}

function Leaderboard({ args, limit }: { args: { guestToken?: string }; limit: number }) {
	const board = useQuery(api.arcade.queries.leaderboard, args);
	if (!board) return <p className="mt-8 text-center text-dim">reading the board…</p>;
	if (board.top.length === 0) {
		return <p className="mt-8 text-center text-[19px] text-dim">no riders yet. be the first.</p>;
	}
	return (
		<ol className="mx-auto mt-8 w-full max-w-[26rem] text-[20px] sm:text-[22px]">
			{board.top.slice(0, limit).map((row, i) => (
				<li
					key={`${i}-${row.initials}-${row.score}`}
					className={`flex items-baseline justify-between gap-4 ${row.mine ? "glow-amber" : ""}`}
				>
					<span className="text-dim">{pad(i + 1, 2)}</span>
					<span className={`font-display text-[16px] sm:text-[18px] ${row.mine ? "" : "text-ice"}`}>
						{row.initials}
					</span>
					<span className="ml-auto tabular-nums">{row.score.toLocaleString("en-US")}</span>
					<span className="w-12 text-right text-dim">lv{row.level}</span>
				</li>
			))}
			<li className="mt-2 text-right text-[16px] text-dim">{board.total.toLocaleString("en-US")} riders ranked</li>
		</ol>
	);
}

function Panel({ children, wide }: { children: ReactNode; wide?: boolean }) {
	return (
		<div className="absolute inset-0 flex items-center justify-center overflow-y-auto bg-[radial-gradient(ellipse_at_center,color-mix(in_oklab,var(--color-void)_88%,transparent),color-mix(in_oklab,var(--color-void)_55%,transparent))] px-5 py-16">
			<div className={`screen-in w-full ${wide ? "max-w-[860px]" : "max-w-[640px]"}`}>{children}</div>
		</div>
	);
}

function Center({ children }: { children: ReactNode }) {
	return (
		<div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
			{children}
		</div>
	);
}

function Key({ children }: { children: ReactNode }) {
	return <span className="text-cyan">{children}</span>;
}

function TouchRow({ children }: { children: ReactNode }) {
	return <div className="mt-8 hidden flex-wrap items-center justify-center gap-3 pointer-coarse:flex">{children}</div>;
}

function TouchButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
	return (
		<button type="button" onClick={onClick} className="border border-line-strong px-4 py-2 text-[20px] text-fog">
			{children}
		</button>
	);
}

/** The leaderboard is a nicety: if it fails (offline, not deployed), the game still runs. */
class Quiet extends Component<{ children: ReactNode; fallback?: ReactNode }, { failed: boolean }> {
	state = { failed: false };
	static getDerivedStateFromError() {
		return { failed: true };
	}
	render() {
		return this.state.failed ? (this.props.fallback ?? null) : this.props.children;
	}
}
