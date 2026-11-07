"use client";

import type { UIMessage } from "@convex-dev/agent/react";
import { SIGN_IN_PATH, SIGN_UP_PATH } from "../authLinks";
import { AwaitingReply, ProgramReply, UserLine } from "./Message";

export type LocalLine = {
	id: number;
	/** Number of server messages on screen when this line was printed. */
	after: number;
	kind: "help" | "notice" | "error";
	text: string;
};

const LINK_FAILED: LocalLine = {
	id: -1,
	after: 0,
	kind: "error",
	text: "Could not open a guest link. Reload the page to try again, or sign in.",
};

/**
 * The conversation after the boot: the messages, with the terminal's own
 * lines (help, notices, errors) printed where they happened.
 */
export function Transcript({
	messages,
	lines,
	cleared,
	handle,
	awaiting,
	linkFailed,
	gate,
}: {
	messages: UIMessage[];
	lines: LocalLine[];
	/** Server messages hidden by /clear. */
	cleared: number;
	handle: string;
	awaiting: boolean;
	linkFailed: boolean;
	gate: "session" | "network" | null;
}) {
	const linesAt = (count: number) => lines.filter((l) => l.after === count);
	return (
		<>
			{linesAt(cleared).map((l) => (
				<LocalOutput key={l.id} line={l} />
			))}
			{messages.map((m, i) => (
				<div key={m.key}>
					{m.role === "user" ? (
						<UserLine text={m.text} handle={handle} />
					) : (
						<ProgramReply message={m} isLatest={i === messages.length - 1} />
					)}
					{linesAt(cleared + i + 1).map((l) => (
						<LocalOutput key={l.id} line={l} />
					))}
				</div>
			))}
			{awaiting && <AwaitingReply />}
			{linkFailed && <LocalOutput line={LINK_FAILED} />}
			{gate && <SessionGate reason={gate} />}
		</>
	);
}

function LocalOutput({ line }: { line: LocalLine }) {
	if (line.kind === "help") {
		return (
			<pre className="line-in mt-5 whitespace-pre-wrap font-crt text-[19px] leading-snug text-fog sm:text-[21px]">
				<span className="text-cyan">commands</span>
				{"\n"}
				{line.text}
			</pre>
		);
	}
	return (
		<p
			className={`line-in mt-5 text-[19px] leading-snug sm:text-[21px] ${
				line.kind === "error" ? "text-danger" : "text-amber"
			}`}
		>
			<span className="select-none">{"// "}</span>
			{line.text}
		</p>
	);
}

/** The end of a guest session: in character, with the way forward. */
function SessionGate({ reason }: { reason: "session" | "network" }) {
	return (
		<section
			aria-label="Guest session ended"
			className="line-in mb-16 mt-12 border-l-2 border-amber pl-5 text-[19px] leading-snug sm:text-[21px]"
		>
			<p className="glow-amber uppercase tracking-[0.14em]">
				link terminated <span aria-hidden>{"■"}</span>
			</p>
			<p className="mt-3 max-w-[52ch] text-fog">
				{reason === "network"
					? "Guest links from this network have used today’s transmissions."
					: "That was the last of this session’s ten transmissions."}{" "}
				Sign in to open a persistent channel: a deeper model, thirty messages a
				day, and a conversation that is still here when you come back.
			</p>
			<div className="mt-6 flex flex-wrap items-center gap-6 uppercase tracking-[0.1em]">
				<a href={SIGN_IN_PATH} className="reverse-amber px-3 active:translate-y-px">
					sign in
				</a>
				<a href={SIGN_UP_PATH} className="text-dim transition-colors hover:text-ice">
					create an account
				</a>
			</div>
		</section>
	);
}
