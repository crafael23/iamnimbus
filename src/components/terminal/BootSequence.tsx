"use client";

import { useEffect, useState } from "react";

export type BootLine = { label: string; value: string };

const STEP_MS = 260;

/**
 * The door into the terminal. Lines print one at a time, then the prompt
 * appears. Any key, click or tap skips ahead. With `instant` (already booted
 * this session, or reduced motion) everything renders at once.
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
	const total = lines.length + 2; // wordmark + lines + closing hint
	const [shown, setShown] = useState(instant ? total : 0);
	const done = shown >= total;

	useEffect(() => {
		if (done) {
			onDone();
			return;
		}
		const timer = window.setTimeout(
			() => setShown((n) => n + 1),
			shown === 0 ? 180 : STEP_MS,
		);
		return () => window.clearTimeout(timer);
	}, [shown, done, onDone]);

	useEffect(() => {
		if (done) return;
		const skip = () => setShown(total);
		window.addEventListener("keydown", skip);
		window.addEventListener("pointerdown", skip);
		return () => {
			window.removeEventListener("keydown", skip);
			window.removeEventListener("pointerdown", skip);
		};
	}, [done, total]);

	return (
		<section aria-label="System start" className="select-none pb-8 pt-6 sm:pt-12">
			{shown >= 1 && (
				<h1 className="line-in font-display text-[clamp(1.6rem,6vw,2.9rem)] font-light leading-[1.1] tracking-[-0.02em] text-ice">
					<span className="glow-text">nimbus</span>
					<span className="text-cyan-dim">{"//"}</span>
					<span>grid</span>
				</h1>
			)}
			<ul className="mt-6 max-w-[34rem] space-y-1.5 text-[13px] sm:text-sm">
				{lines.slice(0, Math.max(0, shown - 1)).map((line) => (
					<li key={line.label} className="line-in flex items-baseline gap-2">
						<span className="text-cyan">[ ok ]</span>
						<span className="text-fog">{line.label}</span>
						<span
							aria-hidden
							className="mx-1 flex-1 translate-y-[-3px] border-b border-dotted border-line-strong"
						/>
						<span className="text-ice">{line.value}</span>
					</li>
				))}
			</ul>
			{shown >= total && (
				<p className="line-in mt-6 max-w-[40rem] text-sm leading-relaxed text-fog">
					Ask about projects, writing or work. Type{" "}
					<span className="text-cyan">/</span> for commands.
				</p>
			)}
			{!done && (
				<p className="mt-6 text-xs text-dim">press any key to skip</p>
			)}
		</section>
	);
}
