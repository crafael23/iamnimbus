"use client";

import {
	optimisticallySendMessage,
	useUIMessages,
} from "@convex-dev/agent/react";
import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type KeyboardEvent,
} from "react";
import { SiteNav } from "@/components/SiteNav";
import { api } from "../../../convex/_generated/api";
import { BootSequence, type BootLine } from "./BootSequence";
import { COMMANDS, matchCommands } from "./commands";
import { guestToken } from "./guestToken";
import { AwaitingReply, ProgramReply, UserLine } from "./Message";
import {
	clearedAt,
	hasBooted,
	markBooted,
	saveClearedAt,
	savedGuestThread,
	saveGuestThread,
} from "./storage";

type LocalLine = {
	id: number;
	/** Number of server messages on screen when this line was printed. */
	after: number;
	kind: "help" | "notice" | "error";
	text: string;
};

const prefersReducedMotion = () =>
	typeof window !== "undefined" &&
	window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function Terminal() {
	const { user } = useAuth();
	const { isLoading: authLoading, isAuthenticated } = useConvexAuth();

	const [threadId, setThreadId] = useState<string | null>(null);
	const [booted, setBooted] = useState(() => hasBooted() || prefersReducedMotion());
	const [bootDone, setBootDone] = useState(booted);
	const [input, setInput] = useState("");
	const [selected, setSelected] = useState(0);
	const [lines, setLines] = useState<LocalLine[]>([]);
	const [cleared, setCleared] = useState(0);
	const [gateCode, setGateCode] = useState<string | null>(null);
	const [linkFailed, setLinkFailed] = useState(false);
	/**
	 * The guest token reads subscribe with. Kept for the page's life (the
	 * server accepts it for reads after expiry); writes fetch a current one.
	 */
	const [readToken, setReadToken] = useState<string | null>(null);
	const lineId = useRef(0);
	/** Set while a message waits on a guest token, before `replying` can see it. */
	const sending = useRef(false);

	const startThread = useMutation(api.chat.mutations.startThread);
	const sendMessage = useMutation(
		api.chat.mutations.sendMessage,
	).withOptimisticUpdate((store, args) =>
		optimisticallySendMessage(api.chat.queries.listThreadMessages)(store, {
			threadId: args.threadId,
			prompt: args.prompt,
		}),
	);

	const asGuest = !authLoading && !isAuthenticated;
	const tokenArg = asGuest ? (readToken ?? undefined) : undefined;
	const session = useQuery(
		api.chat.queries.session,
		authLoading || (asGuest && !readToken) ? "skip" : { guestToken: tokenArg },
	);

	// Guests: get a signed guest link from the server before anything else.
	useEffect(() => {
		if (!asGuest || readToken) return;
		let cancelled = false;
		guestToken()
			.then((token) => {
				if (!cancelled) setReadToken(token);
			})
			.catch(() => {
				if (!cancelled) setLinkFailed(true);
			});
		return () => {
			cancelled = true;
		};
	}, [asGuest, readToken]);

	// Open (or resume) the visitor's thread whenever the auth state settles.
	useEffect(() => {
		if (authLoading || (!isAuthenticated && !readToken)) return;
		let cancelled = false;
		(isAuthenticated ? Promise.resolve(undefined) : guestToken())
			.then((token) =>
				startThread({
					guestToken: token,
					resume: isAuthenticated ? undefined : savedGuestThread(),
				}),
			)
			.then(({ threadId: id }) => {
				if (cancelled) return;
				if (!isAuthenticated) saveGuestThread(id);
				setCleared(clearedAt(id));
				setThreadId(id);
			})
			.catch(() => {
				if (!cancelled) setThreadId(null);
			});
		return () => {
			cancelled = true;
		};
	}, [authLoading, isAuthenticated, readToken, startThread]);

	const { results: messages } = useUIMessages(
		api.chat.queries.listThreadMessages,
		threadId ? { threadId, guestToken: tokenArg } : "skip",
		{ initialNumItems: 60, stream: true },
	);

	const visibleMessages = useMemo(
		() => (messages ?? []).slice(cleared),
		[messages, cleared],
	);
	const last = visibleMessages.at(-1);
	const awaiting = last?.role === "user";
	const replying =
		awaiting || last?.status === "streaming" || last?.status === "pending";

	const tier = session?.tier ?? (isAuthenticated ? "registered" : "guest");
	const outOfMessages = session ? session.remaining <= 0 : false;
	const gated =
		tier === "guest" &&
		(outOfMessages || gateCode === "GUEST_LIMIT" || gateCode === "NETWORK_LIMIT") &&
		!replying;
	const handle = tier === "guest" ? "guest" : (user?.firstName?.toLowerCase() ?? "you");

	const print = useCallback(
		(kind: LocalLine["kind"], text: string) => {
			lineId.current += 1;
			const id = lineId.current;
			setLines((prev) => [
				...prev,
				{ id, after: messages?.length ?? 0, kind, text },
			]);
		},
		[messages?.length],
	);

	// --- scrolling: stick to the bottom while new output arrives ----------
	const scroller = useRef<HTMLDivElement>(null);
	const content = useRef<HTMLDivElement>(null);
	const stick = useRef(true);
	useEffect(() => {
		const el = scroller.current;
		const inner = content.current;
		if (!el || !inner) return;
		const observer = new ResizeObserver(() => {
			if (stick.current) el.scrollTop = el.scrollHeight;
		});
		observer.observe(inner);
		return () => observer.disconnect();
	}, []);
	const onScroll = () => {
		const el = scroller.current;
		if (!el) return;
		stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 96;
	};

	// --- input -------------------------------------------------------------
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const suggestions = matchCommands(input);
	const showSuggestions = suggestions.length > 0 && input !== suggestions[0]?.name;

	useEffect(() => {
		if (bootDone) inputRef.current?.focus({ preventScroll: true });
	}, [bootDone]);

	const submit = async (raw: string) => {
		const text = raw.trim();
		if (!text) return;
		const isLocal = text.startsWith("/help") || text.startsWith("/clear");
		// Keep the text in the box until the thread is ready to receive it.
		if ((!threadId || sending.current) && !isLocal) return;
		setInput("");
		setSelected(0);
		stick.current = true;
		const command = text.split(/\s+/)[0]?.toLowerCase();

		if (command === "/help") {
			print(
				"help",
				COMMANDS.map((c) => `${c.name.padEnd(10)} ${c.hint}`).join("\n"),
			);
			return;
		}
		if (command === "/clear") {
			const count = messages?.length ?? 0;
			if (threadId) saveClearedAt(threadId, count);
			setCleared(count);
			setLines([]);
			return;
		}
		if (command?.startsWith("/") && !COMMANDS.some((c) => c.name === command)) {
			print("error", `Unknown command ${command}. Type /help for the list.`);
			return;
		}
		if (!threadId) return;
		sending.current = true;
		try {
			await sendMessage({
				threadId,
				prompt: text,
				guestToken: isAuthenticated ? undefined : await guestToken(),
			});
		} catch (error) {
			const code =
				error instanceof ConvexError
					? ((error.data as { code?: string }).code ?? "")
					: "";
			if (code === "GUEST_LIMIT" || code === "NETWORK_LIMIT") {
				setGateCode(code);
			} else if (code === "DAILY_LIMIT") {
				print(
					"notice",
					"You have used today's 30 messages. The channel reopens as the 24-hour window rolls forward.",
				);
			} else if (code === "CAPACITY") {
				print(
					"notice",
					"The grid is at capacity for guest links right now. Sign in, or try again in a few minutes.",
				);
			} else if (code === "TOO_LONG") {
				setInput(text);
				print("error", "That message is over 2,000 characters. Trim it and send again.");
			} else {
				setInput(text);
				print("error", "The message did not go through. Check your connection and send it again.");
			}
		} finally {
			sending.current = false;
		}
	};

	const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
		if (showSuggestions) {
			if (e.key === "ArrowDown" || e.key === "ArrowUp") {
				e.preventDefault();
				const delta = e.key === "ArrowDown" ? 1 : -1;
				setSelected((i) => (i + delta + suggestions.length) % suggestions.length);
				return;
			}
			if (e.key === "Tab" || e.key === "Enter") {
				e.preventDefault();
				const pick = suggestions[selected] ?? suggestions[0];
				if (!pick) return;
				if (e.key === "Enter") void submit(pick.name);
				else setInput(pick.name);
				return;
			}
			if (e.key === "Escape") {
				setInput("");
				return;
			}
		}
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			if (!replying) void submit(input);
		}
	};

	// --- boot --------------------------------------------------------------
	const bootLines: BootLine[] = [
		{ label: "handshake", value: "secure" },
		{ label: "knowledge base", value: "6 sectors online" },
		{ label: "persona", value: "loaded" },
		{
			label: "session",
			value:
				tier === "guest"
					? `guest link, ${session?.limit ?? 10} transmissions`
					: `persistent channel, ${session?.limit ?? 30}/day`,
		},
	];
	const finishBoot = useCallback(() => {
		markBooted();
		setBooted(true);
		setBootDone(true);
	}, []);

	const status = session ? (
		<span
			className={`hidden whitespace-nowrap text-[12px] sm:inline ${
				session.remaining <= 3 ? "text-amber" : "text-dim"
			}`}
			title="Messages used in this session"
		>
			{tier === "guest" ? "guest link" : "channel"} {session.used}/{session.limit}
		</span>
	) : null;

	const linesAt = (count: number) =>
		lines.filter((l) => l.after === count);

	return (
		<div className="relative flex h-[100dvh] flex-col overflow-hidden bg-void">
			<div aria-hidden className="grid-wall" />
			<div
				aria-hidden
				className={`grid-floor ${replying ? "is-live" : ""} ${
					visibleMessages.length > 0 ? "is-dim" : ""
				}`}
			/>

			<SiteNav status={status} />

			<div
				ref={scroller}
				onScroll={onScroll}
				className="relative z-10 min-h-0 flex-1 overflow-y-auto overscroll-contain"
			>
				<div
					ref={content}
					role="log"
					aria-live="polite"
					aria-relevant="additions"
					className="mx-auto max-w-[860px] px-4 pb-10 sm:px-6"
				>
					{cleared === 0 && (
						<BootSequence lines={bootLines} instant={booted} onDone={finishBoot} />
					)}
					{bootDone && (
						<>
							{linesAt(cleared).map((l) => (
								<LocalOutput key={l.id} line={l} />
							))}
							{visibleMessages.map((m, i) => (
								<div key={m.key}>
									{m.role === "user" ? (
										<UserLine text={m.text} handle={handle} />
									) : (
										<ProgramReply
											message={m}
											isLatest={i === visibleMessages.length - 1}
										/>
									)}
									{linesAt(cleared + i + 1).map((l) => (
										<LocalOutput key={l.id} line={l} />
									))}
								</div>
							))}
							{awaiting && <AwaitingReply />}
							{linkFailed && (
								<LocalOutput
									line={{
										id: -1,
										after: 0,
										kind: "error",
										text: "Could not open a guest link. Reload the page to try again, or sign in.",
									}}
								/>
							)}
							{gated && (
								<SessionGate reason={gateCode === "NETWORK_LIMIT" ? "network" : "session"} />
							)}
						</>
					)}
				</div>
			</div>

			{bootDone && !gated && (
				<div className="relative z-10 shrink-0 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-2 sm:px-6 sm:pb-6">
					<div className="mx-auto max-w-[860px]">
						{showSuggestions && (
							<ul
								id="command-list"
								aria-label="Commands"
								className="mb-2 border border-line bg-deep/95 py-1 text-[13px] backdrop-blur-sm"
							>
								{suggestions.map((c, i) => (
									<li key={c.name}>
										<button
											type="button"
											tabIndex={-1}
											aria-current={i === selected ? "true" : undefined}
											onPointerDown={(e) => {
												e.preventDefault();
												void submit(c.name);
											}}
											className={`flex w-full gap-4 px-3 py-1.5 text-left ${
												i === selected ? "bg-cyan/10 text-cyan" : "text-fog"
											}`}
										>
											<span className="w-[10ch] shrink-0">{c.name}</span>
											<span className="text-dim">{c.hint}</span>
											{c.local && (
												<span className="ml-auto text-dim/70">local</span>
											)}
										</button>
									</li>
								))}
							</ul>
						)}
						<form
							onSubmit={(e) => {
								e.preventDefault();
								if (!replying) void submit(input);
							}}
							className="glow-edge flex items-start gap-[1ch] bg-deep/90 px-3 py-3 backdrop-blur-sm sm:px-4"
						>
							<label htmlFor="prompt" className="shrink-0 select-none pt-[1px] text-cyan glow-text">
								{"❯"}
								<span className="sr-only">Message</span>
							</label>
							<textarea
								id="prompt"
								ref={inputRef}
								value={input}
								rows={1}
								maxLength={2000}
								onChange={(e) => {
									setInput(e.target.value);
									setSelected(0);
								}}
								onKeyDown={onKeyDown}
								placeholder={
									!threadId
										? "connecting…"
										: replying
											? "receiving…"
											: "ask a question, or type /"
								}
								aria-describedby={showSuggestions ? "command-list" : undefined}
								autoComplete="off"
								spellCheck={false}
								className="max-h-40 min-h-[1.5em] w-full resize-none bg-transparent text-[16px] leading-[1.5] text-ice caret-cyan outline-none [field-sizing:content] placeholder:text-dim focus-visible:outline-none sm:text-[15px]"
							/>
							<button
								type="submit"
								disabled={replying || !threadId || !input.trim()}
								className="shrink-0 pt-[1px] text-[12px] uppercase tracking-[0.12em] text-cyan transition-opacity disabled:opacity-30"
							>
								send
							</button>
						</form>
					</div>
				</div>
			)}
		</div>
	);
}

function LocalOutput({ line }: { line: LocalLine }) {
	if (line.kind === "help") {
		return (
			<pre className="line-in mt-4 whitespace-pre-wrap text-[13px] leading-relaxed text-fog sm:text-sm">
				<span className="text-cyan">commands</span>
				{"\n"}
				{line.text}
			</pre>
		);
	}
	return (
		<p
			className={`line-in mt-4 text-[13px] leading-relaxed sm:text-sm ${
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
			className="line-in mt-10 border border-amber/60 bg-deep/80 p-5 shadow-[0_0_28px_-6px_rgba(240,163,94,0.45),inset_0_0_24px_-10px_rgba(240,163,94,0.35)] sm:p-7"
		>
			<p className="font-display text-[13px] tracking-[0.06em] glow-amber">
				guest link closed
			</p>
			<p className="mt-3 max-w-[52ch] text-sm leading-relaxed text-ice">
				{reason === "network"
					? "Guest links from this network have used today\u2019s transmissions."
					: "That was the last of this session\u2019s ten transmissions."}{" "}
				Sign in to open a persistent channel: a deeper model, thirty messages a
				day, and a conversation that is still here when you come back.
			</p>
			<div className="mt-5 flex flex-wrap items-center gap-4">
				{/* Route handlers that redirect to WorkOS, not pages. */}
				{/* oxlint-disable-next-line nextjs/no-html-link-for-pages */}
				<a
					href="/sign-in"
					className="glow-edge inline-flex items-center gap-2 bg-cyan/10 px-5 py-2.5 text-sm text-cyan transition-transform hover:bg-cyan/15 active:translate-y-px"
				>
					sign in
					<span aria-hidden>{"→"}</span>
				</a>
				{/* oxlint-disable-next-line nextjs/no-html-link-for-pages */}
				<a href="/sign-up" className="text-sm text-fog underline-offset-4 hover:text-ice hover:underline">
					create an account
				</a>
			</div>
		</section>
	);
}
