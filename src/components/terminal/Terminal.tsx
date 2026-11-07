"use client";

import { optimisticallySendMessage, type UIMessage } from "@convex-dev/agent/react";
import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { useMutation } from "convex/react";
import { useCallback, useMemo, useRef, useState } from "react";
import { SiteNav } from "@/components/SiteNav";
import { api } from "../../../convex/_generated/api";
import { BootSequence, type BootLine } from "./BootSequence";
import { DustIntro } from "./DustIntro";
import { COMMANDS } from "./commands";
import { guestToken } from "./guestToken";
import { useBoot, useChatThread, useGuestConversion, useStickToBottom } from "./hooks";
import { PromptDock } from "./PromptDock";
import { type SendFailure, sendFailure, type Tier } from "./sendFailure";
import { clearedAt, saveClearedAt } from "./storage";
import { type LocalLine, Transcript } from "./Transcript";

type Session = { tier: Tier; used: number; limit: number; remaining: number };

/** /help and /clear run here, even before a thread is open. */
const isLocalCommand = (text: string) => text.startsWith("/help") || text.startsWith("/clear");

/** Whether a reply is on its way. */
function replyState(messages: UIMessage[]) {
	const last = messages.at(-1);
	const awaiting = last?.role === "user";
	const replying = awaiting || last?.status === "streaming" || last?.status === "pending";
	return { awaiting, replying };
}

/** A guest who has used their transmissions sees the gate instead of the prompt. */
function guestGate(
	tier: Tier,
	session: Session | null | undefined,
	gateCode: SendFailure["gate"] | null,
	replying: boolean,
): "session" | "network" | null {
	if (tier !== "guest" || replying) return null;
	const outOfMessages = session ? session.remaining <= 0 : false;
	if (!outOfMessages && !gateCode) return null;
	return gateCode === "NETWORK_LIMIT" ? "network" : "session";
}

const bootLines = (tier: Tier, limit: number | undefined): BootLine[] => [
	{ label: "phosphor", value: "grid blue" },
	{ label: "archive", value: "6 sectors indexed" },
	{
		label: "link",
		value: tier === "guest" ? `guest · ${limit ?? 10} transmissions` : `persistent · ${limit ?? 30}/day`,
	},
];

export function Terminal() {
	const { user } = useAuth();
	const boot = useBoot();
	const [cleared, setCleared] = useState(0);
	const { threadId, session, messages, linkFailed, isAuthenticated } = useChatThread((id) =>
		setCleared(clearedAt(id)),
	);
	useGuestConversion(isAuthenticated);
	const sendMessage = useMutation(api.chat.mutations.sendMessage).withOptimisticUpdate((store, args) =>
		optimisticallySendMessage(api.chat.queries.listThreadMessages)(store, {
			threadId: args.threadId,
			prompt: args.prompt,
		}),
	);
	const [lines, setLines] = useState<LocalLine[]>([]);
	const [gateCode, setGateCode] = useState<SendFailure["gate"] | null>(null);
	const [degauss, setDegauss] = useState(false);
	const lineId = useRef(0);
	/** Set while a message waits on a guest token, before `replying` can see it. */
	const sending = useRef(false);
	const { scroller, content, onScroll, pin } = useStickToBottom();

	const visibleMessages = useMemo(() => (messages ?? []).slice(cleared), [messages, cleared]);
	const { awaiting, replying } = replyState(visibleMessages);
	const tier: Tier = session?.tier ?? (isAuthenticated ? "registered" : "guest");
	const gate = guestGate(tier, session, gateCode, replying);
	const handle = tier === "guest" ? "guest" : (user?.firstName?.toLowerCase() ?? "you");

	const print = useCallback(
		(kind: LocalLine["kind"], text: string) => {
			lineId.current += 1;
			const id = lineId.current;
			setLines((prev) => [...prev, { id, after: messages?.length ?? 0, kind, text }]);
		},
		[messages?.length],
	);

	const canSend = (text: string) => isLocalCommand(text) || (threadId !== null && !sending.current);

	/** Run a command, or send a message; resolves to text to put back in the box. */
	const send = async (text: string): Promise<string | null> => {
		pin();
		const command = text.split(/\s+/)[0]?.toLowerCase();
		if (command === "/help") {
			print("help", COMMANDS.map((c) => `${c.name.padEnd(10)} ${c.hint}`).join("\n"));
			return null;
		}
		if (command === "/clear") {
			const count = messages?.length ?? 0;
			if (threadId) saveClearedAt(threadId, count);
			setCleared(count);
			setLines([]);
			setDegauss(true);
			return null;
		}
		if (command?.startsWith("/") && !COMMANDS.some((c) => c.name === command)) {
			print("error", `Unknown command ${command}. Type /help for the list.`);
			return null;
		}
		if (!threadId) return null;
		sending.current = true;
		let failure: { error: unknown } | null = null;
		try {
			let token: string | undefined;
			if (!isAuthenticated) token = await guestToken();
			await sendMessage({ threadId, prompt: text, guestToken: token });
		} catch (error) {
			failure = { error };
		}
		sending.current = false;
		if (!failure) return null;
		const outcome = sendFailure(failure.error, tier);
		if (outcome.gate) setGateCode(outcome.gate);
		if (outcome.line) print(outcome.line.kind, outcome.line.text);
		return outcome.restore ? text : null;
	};

	return (
		<div
			className={`relative flex h-full flex-col overflow-hidden font-crt ${degauss ? "degauss" : ""}`}
			onAnimationEnd={(e) => {
				if (e.target === e.currentTarget) setDegauss(false);
			}}
		>
			{boot.intro && <DustIntro onReveal={boot.reveal} />}
			<SiteNav status={session ? <SessionStatus tier={tier} session={session} /> : null} />

			<div
				ref={scroller}
				onScroll={onScroll}
				className="relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain"
			>
				<div
					ref={content}
					role="log"
					aria-live="polite"
					aria-relevant="additions"
					className="crt-text mx-auto w-full max-w-[860px] px-5 sm:px-10"
				>
					{cleared === 0 ? (
						<BootSequence lines={bootLines(tier, session?.limit)} mode={boot.mode} onDone={boot.finish} />
					) : (
						<p className="line-in pt-10 text-[19px] text-dim sm:pt-16 sm:text-[21px]">
							{"// "}screen cleared. The conversation is still in memory.
						</p>
					)}
					{boot.done && (
						<Transcript
							messages={visibleMessages}
							lines={lines}
							cleared={cleared}
							handle={handle}
							awaiting={awaiting}
							linkFailed={linkFailed}
							gate={gate}
						/>
					)}
				</div>
				{boot.done && !gate && (
					<PromptDock
						scroller={scroller}
						ready={threadId !== null}
						replying={replying}
						canSend={canSend}
						onSend={send}
					/>
				)}
			</div>
		</div>
	);
}

/** Messages used, in the nav: amber when few are left. */
function SessionStatus({ tier, session }: { tier: Tier; session: Session }) {
	return (
		<span
			className={`hidden whitespace-nowrap sm:inline ${session.remaining <= 3 ? "glow-amber" : "text-dim"}`}
			title="Messages used in this session"
		>
			{tier === "guest" ? "link" : "channel"} {String(session.used).padStart(2, "0")}/{session.limit}
		</span>
	);
}
