"use client";

import { type CSSProperties, useEffect, useState } from "react";
import { createPortal } from "react-dom";

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
	// header, wordmark, each line, the whisper, the hint
	const total = lines.length + 4;
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
			shown === 0 ? (powering ? POWER_MS : 120) : shown === 2 ? WORDMARK_HOLD_MS : STEP_MS;
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

	const header = "nimbus systems · terminal services · all transmissions logged";

	return (
		<section aria-label="System start" className="select-none pb-6 pt-8 sm:pt-14">
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
				<p
					className={`${animate ? "type-in" : ""} text-[14px] uppercase tracking-[0.2em] text-dim sm:text-[17px]`}
					style={chars(header.length)}
				>
					{header}
				</p>
			)}
			{shown >= 2 && (
				<h1
					className={`${animate ? "bleed-in" : "scanned"} mt-5 font-display text-[clamp(1.25rem,6.6vw,4.5rem)] leading-[1.08] text-ice`}
				>
					<span className="glow-text">nimbus</span>
					<span className="text-cyan-dim">{"//"}</span>
					<span>grid</span>
				</h1>
			)}
			<ul className="mt-7 max-w-[36rem] space-y-0.5 text-[19px] sm:text-[21px]">
				{lines.slice(0, Math.max(0, shown - 2)).map((line) => (
					<li
						key={line.label}
						className={`${animate ? "type-in" : ""} flex items-baseline gap-2`}
						style={chars(line.label.length + line.value.length + 18)}
					>
						<span className="text-cyan-dim">{">"}</span>
						<span className="text-fog">{line.label}</span>
						<span
							aria-hidden
							className="mx-1 flex-1 translate-y-[-5px] border-b border-dotted border-line-strong"
						/>
						<span className="text-ice">{line.value}</span>
					</li>
				))}
			</ul>
			{shown >= lines.length + 3 && (
				<p
					className={`${animate ? "line-in" : ""} whisper mt-7 text-[19px] text-cyan-dim sm:text-[21px]`}
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
				<p className="mt-8 text-[15px] uppercase tracking-[0.16em] text-dim">
					press any key to skip
				</p>
			)}
		</section>
	);
}
