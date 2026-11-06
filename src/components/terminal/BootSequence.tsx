"use client";

import { type CSSProperties, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { PROFILE_LINKS } from "../../../convex/_lib/profile";

export type BootLine = { label: string; value: string };

const POWER_MS = 1000;
const WORDMARK_HOLD_MS = 750;
const STEP_MS = 340;

const chars = (n: number) => ({ "--n": n }) as CSSProperties;

/**
 * The door into the terminal. The tube powers on, the wordmark's phosphor
 * bleeds into focus, and the status lines type out. Any key, click or tap
 * skips ahead. With `instant` (already booted this session, or reduced
 * motion) everything renders at once, without animation.
 */
export function BootSequence({
	lines,
	instant,
	onDone,
}: {
	lines: BootLine[];
	instant: boolean;
	onDone: () => void;
}) {
	// wordmark, each line, the whisper, the hint
	const total = lines.length + 3;
	const [shown, setShown] = useState(instant ? total : 0);
	const [powering, setPowering] = useState(!instant);
	const done = shown >= total;
	const animate = !instant;

	useEffect(() => {
		if (done) {
			onDone();
			return;
		}
		const delay =
			shown === 0 ? (powering ? POWER_MS : 120) : shown === 1 ? WORDMARK_HOLD_MS : STEP_MS;
		const timer = window.setTimeout(() => setShown((n) => n + 1), delay);
		return () => window.clearTimeout(timer);
	}, [shown, done, powering, onDone]);

	useEffect(() => {
		if (done) return;
		const skip = () => {
			setPowering(false);
			setShown(total);
		};
		window.addEventListener("keydown", skip);
		window.addEventListener("pointerdown", skip);
		return () => {
			window.removeEventListener("keydown", skip);
			window.removeEventListener("pointerdown", skip);
		};
	}, [done, total]);

	return (
		<section aria-label="System start" className="select-none pb-6 pt-10 sm:pt-20">
			{/* Portaled so the flash covers the whole tube, nav included. */}
			{powering &&
				createPortal(
					<>
						<div className="crt-static" />
						<div
							className="crt-power"
							onAnimationEnd={(e) => {
								if (e.pseudoElement === "") setPowering(false);
							}}
						/>
					</>,
					document.body,
				)}
			{shown >= 1 && (
				<h1
					className={`${animate ? "bleed-in" : "scanned"} font-display text-[clamp(1.4rem,5.4vw,3.1rem)] leading-[1.08]`}
				>
					<span className="glow-text">nimbus</span>
				</h1>
			)}
			{/* Status lines, with the owner's profiles tucked into a quiet right column. */}
			<dl className="mt-8 grid max-w-[44rem] grid-cols-[9ch_1fr_auto] gap-x-3 text-[19px] leading-snug sm:text-[21px]">
				{lines.slice(0, Math.max(0, shown - 1)).map((line, i) => {
					const profile = PROFILE_LINKS[i];
					return (
						<div key={line.label} className="contents">
							<dt className={`${animate ? "line-in" : ""} text-dim`}>{line.label}</dt>
							<dd
								className={`${animate ? "type-in" : ""} ${profile ? "" : "col-span-2"}`}
								style={chars(line.value.length + 4)}
							>
								{line.value}
							</dd>
							{profile && (
								<a
									href={profile.href}
									target="_blank"
									rel="me noopener noreferrer"
									className={`${animate ? "line-in" : ""} justify-self-end lowercase text-dim transition-colors hover:text-cyan`}
								>
									{profile.label} ↗
								</a>
							)}
						</div>
					);
				})}
			</dl>
			{shown >= lines.length + 3 && (
				<p
					className={`${animate ? "line-in" : ""} mt-8 text-[19px] text-cyan-dim sm:text-[21px]`}
				>
					someone left this terminal running.
				</p>
			)}
			{shown >= total && (
				<p
					className={`${animate ? "line-in" : ""} mt-1 max-w-[46rem] text-[19px] leading-snug text-fog sm:text-[21px]`}
				>
					Ask about projects, writing or work. Type{" "}
					<span className="glow-text">/</span> for commands.
				</p>
			)}
			{!done && (
				<p className="mt-10 text-[15px] uppercase tracking-[0.16em] text-dim">
					press any key to skip
				</p>
			)}
		</section>
	);
}
