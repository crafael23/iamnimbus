"use client";

import { useSmoothText, type UIMessage } from "@convex-dev/agent/react";
import { Markdown } from "@/components/Markdown";

const TEXT = "text-[19px] sm:text-[21px]";

export function UserLine({ text, handle }: { text: string; handle: string }) {
	return (
		<div className={`line-in flex gap-[1ch] pt-7 leading-snug ${TEXT}`}>
			<span className="shrink-0 select-none uppercase text-amber-dim">
				{handle}
				<span className="text-amber">{">"}</span>
			</span>
			<p className="min-w-0 whitespace-pre-wrap break-words text-amber">{text}</p>
		</div>
	);
}

/**
 * A program reply: indented under a faint phosphor rule, typed out smoothly
 * while it streams. The cursor advances while streaming, then blinks once and
 * holds on the latest reply.
 */
export function ProgramReply({
	message,
	isLatest,
}: {
	message: UIMessage;
	isLatest: boolean;
}) {
	const streaming = message.status === "streaming" || message.status === "pending";
	const [visible, { isStreaming }] = useSmoothText(message.text, {
		startStreaming: streaming,
	});
	const typing = streaming || isStreaming;
	const failed = message.status === "failed";

	return (
		<div className={`reply-rule line-in mt-3 pl-[2ch] sm:ml-[1ch] ${TEXT}`}>
			{visible ? (
				<Markdown
					variant="terminal"
					cursor={
						isLatest && !failed ? (typing ? "typing" : "settled") : undefined
					}
				>
					{visible}
				</Markdown>
			) : isLatest && !failed ? (
				<span aria-hidden className="cursor-block cursor-blink" />
			) : null}
			{failed && (
				<p className="mt-2 uppercase text-danger">
					{"// "}transmission lost. Send the message again.
				</p>
			)}
		</div>
	);
}

/** Shown between sending and the first streamed token. */
export function AwaitingReply() {
	return (
		<div className={`reply-rule mt-3 pl-[2ch] sm:ml-[1ch] ${TEXT}`}>
			<span className="mr-2 uppercase tracking-[0.1em] text-dim">receiving</span>
			<span aria-hidden className="cursor-block cursor-blink" />
			<span className="sr-only">Waiting for a reply</span>
		</div>
	);
}
