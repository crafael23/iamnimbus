"use client";

import { useSmoothText, type UIMessage } from "@convex-dev/agent/react";
import { Markdown } from "@/components/Markdown";

export function UserLine({ text, handle }: { text: string; handle: string }) {
	return (
		<div className="line-in flex gap-[1ch] pt-6 text-[14px] leading-relaxed sm:text-[15px]">
			<span className="shrink-0 select-none text-amber-dim">
				{handle}
				<span className="text-amber">{" ~$"}</span>
			</span>
			<p className="min-w-0 whitespace-pre-wrap break-words text-amber">{text}</p>
		</div>
	);
}

/**
 * A program reply: indented under a glowing rule, typed out smoothly while it
 * streams. The cursor advances while streaming, then blinks once and holds on
 * the latest reply.
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
		<div className="reply-rule line-in mt-3 pl-[2ch] text-[14px] sm:ml-[1ch] sm:text-[15px]">
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
				<p className="mt-2 text-danger">
					Transmission lost. Send the message again.
				</p>
			)}
		</div>
	);
}

/** Shown between sending and the first streamed token. */
export function AwaitingReply() {
	return (
		<div className="reply-rule mt-3 pl-[2ch] sm:ml-[1ch]">
			<span aria-hidden className="cursor-block cursor-blink" />
			<span className="sr-only">Waiting for a reply</span>
		</div>
	);
}
