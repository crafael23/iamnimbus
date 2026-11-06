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
	useLayoutEffect,
	useRef,
	useState,
	type KeyboardEvent,
} from "react";
import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { api } from "../../../convex/_generated/api";
import { BootSequence, type BootLine } from "./BootSequence";
import { DustIntro } from "./DustIntro";
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
	/** The session's first visit opens on the dusty screen (DustIntro). */
	const [intro] = useState(() => !booted);
	const [revealed, setRevealed] = useState(!intro);
	const reveal = useCallback(() => setRevealed(true), []);
	const [input, setInput] = useState("");
	const [selected, setSelected] = useState(0);
	const [lines, setLines] = useState<LocalLine[]>([]);
	const [cleared, setCleared] = useState(0);
	const [gateCode, setGateCode] = useState<string | null>(null);
	const [linkFailed, setLinkFailed] = useState(false);
	const [degauss, setDegauss] = useState(false);
	/**
	 * The guest token reads subscribe with. Kept for the page's life (the
	 * server accepts it for reads after expiry); writes fetch a current one.
	 */
	const [readToken, setReadToken] = useState<string | null>(null);
	const lineId = useRef(0);
	/** Set while a message waits on a guest token, before `replying` can see it. */
	const sending = useRef(false);

	const conversionSent = useRef(false);
	const convertGuest = useMutation(api.analytics.mutations.convertGuest);
	// On a first sign-in the WorkOS webhook may not have created the user row
	// yet, and convertGuest needs it: wait until the profile exists.
	const profile = useQuery(
		api.users.queries.getMyProfileOrNull,
		isAuthenticated ? {} : "skip",
	);
	useEffect(() => {
		if (!profile || conversionSent.current) return;
		conversionSent.current = true;
		void guestToken()
			.then((token) => convertGuest({ guestToken: token }))
			.catch(() => {});
	}, [profile, convertGuest]);

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

	// The list floats above the box, unless the box sits too close to the top
	// of the screen (a short or cleared conversation): then it opens below.
	const dock = useRef<HTMLDivElement>(null);
	const list = useRef<HTMLUListElement>(null);
	const [listBelow, setListBelow] = useState(false);
	useLayoutEffect(() => {
		const box = dock.current;
		const view = scroller.current;
		const menu = list.current;
		if (!showSuggestions || !box || !view || !menu) return;
		const room = box.getBoundingClientRect().top - view.getBoundingClientRect().top;
		setListBelow(room < menu.offsetHeight + 12);
	}, [showSuggestions, suggestions.length]);

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
			setDegauss(true);
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
					tier === "guest"
						? "The grid is at capacity for guest links right now. Sign in, or try again in a few minutes."
						: "The grid is at capacity right now. Try again a little later.",
				);
			} else if (code === "BUSY") {
				setInput(text);
				print("notice", "Still answering the last message. Send this when it finishes.");
			} else if (code === "BUDGET") {
				const scope = (error as ConvexError<{ scope?: string }>).data.scope;
				setInput(text);
				print(
					"notice",
					scope === "day"
						? "The terminal has used today's power budget and is resting until tomorrow (UTC). Projects and writing are still open."
						: "The terminal has used this month's power budget and is resting until the 1st. Projects and writing are still open.",
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
		{ label: "phosphor", value: "grid blue" },
		{ label: "archive", value: "6 sectors indexed" },
		{
			label: "link",
			value:
				tier === "guest"
					? `guest · ${session?.limit ?? 10} transmissions`
					: `persistent · ${session?.limit ?? 30}/day`,
		},
	];
	const finishBoot = useCallback(() => {
		markBooted();
		setBooted(true);
		setBootDone(true);
	}, []);

	const status = session ? (
		<span
			className={`hidden whitespace-nowrap sm:inline ${
				session.remaining <= 3 ? "glow-amber" : "text-dim"
			}`}
			title="Messages used in this session"
		>
			{tier === "guest" ? "link" : "channel"} {String(session.used).padStart(2, "0")}/
			{session.limit}
		</span>
	) : null;

	const linesAt = (count: number) =>
		lines.filter((l) => l.after === count);

	return (
		<div
			className={`relative flex h-full flex-col overflow-hidden font-crt ${
				degauss ? "degauss" : ""
			}`}
			onAnimationEnd={(e) => {
				if (e.target === e.currentTarget) setDegauss(false);
			}}
		>
			{intro && <DustIntro onReveal={reveal} />}
			<SiteNav status={status} />

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
						<BootSequence
							lines={bootLines}
							mode={booted ? "instant" : revealed ? "play" : "held"}
							onDone={finishBoot}
						/>
					) : (
						<p className="line-in pt-10 text-[19px] text-dim sm:pt-16 sm:text-[21px]">
							{"// "}screen cleared. The conversation is still in memory.
						</p>
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
				{bootDone && !gated && (
					<div className="sticky bottom-0 z-10 mt-8 w-full bg-gradient-to-t from-void from-70% to-transparent px-5 pb-[max(env(safe-area-inset-bottom),16px)] pt-6 sm:px-10 sm:pb-10">
						<div ref={dock} className="relative mx-auto max-w-[860px]">
							{/* Floats over the text so opening it never moves the input. */}
							{showSuggestions && (
								<ul
									ref={list}
									id="command-list"
									aria-label="Commands"
									className={`crt-text absolute inset-x-0 z-20 border border-line bg-void/95 py-1 text-[19px] sm:text-[20px] ${
										listBelow ? "top-full mt-2" : "bottom-full mb-2"
									}`}
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
												className={`flex w-full gap-4 px-2 py-0.5 text-left ${
													i === selected ? "reverse" : "text-fog"
												}`}
											>
												<span className="w-[10ch] shrink-0">{c.name}</span>
												<span className={i === selected ? "" : "text-dim"}>{c.hint}</span>
												{c.local && (
													<span className={`ml-auto uppercase ${i === selected ? "" : "text-dim/70"}`}>
														local
													</span>
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
								className="crt-text flex items-start gap-[1ch] border border-line-strong px-4 py-3 shadow-[0_0_18px_-6px_color-mix(in_oklab,var(--color-cyan)_40%,transparent)] transition-[border-color,box-shadow] focus-within:border-cyan-dim focus-within:shadow-[0_0_24px_-6px_color-mix(in_oklab,var(--color-cyan)_60%,transparent)]"
							>
								<label htmlFor="prompt" className="shrink-0 select-none text-[20px] leading-[1.3] glow-text sm:text-[22px]">
									{">"}
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
									className="max-h-40 min-h-[1.3em] w-full resize-none bg-transparent text-[20px] leading-[1.3] text-ice caret-cyan outline-none [caret-shape:block] [field-sizing:content] placeholder:text-dim focus-visible:outline-none sm:text-[22px]"
								/>
								<button
									type="submit"
									disabled={replying || !threadId || !input.trim()}
									className="shrink-0 text-[17px] uppercase tracking-[0.14em] text-dim transition-colors hover:text-cyan enabled:text-cyan-dim disabled:opacity-0 sm:text-[19px]"
								>
									send
								</button>
							</form>
							<p className="crt-text mt-2 text-right text-[15px] text-dim sm:text-[16px]">
								chats are saved ·{" "}
								<Link href="/privacy" className="underline-offset-4 transition-colors hover:text-cyan hover:underline">
									privacy
								</Link>
							</p>
						</div>
					</div>
				)}
			</div>
		</div>
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
				link terminated <span aria-hidden>{"\u25A0"}</span>
			</p>
			<p className="mt-3 max-w-[52ch] text-fog">
				{reason === "network"
					? "Guest links from this network have used today\u2019s transmissions."
					: "That was the last of this session\u2019s ten transmissions."}{" "}
				Sign in to open a persistent channel: a deeper model, thirty messages a
				day, and a conversation that is still here when you come back.
			</p>
			<div className="mt-6 flex flex-wrap items-center gap-6 uppercase tracking-[0.1em]">
				{/* Route handlers that redirect to WorkOS, not pages. */}
				{/* oxlint-disable-next-line nextjs/no-html-link-for-pages */}
				<a href="/sign-in" className="reverse-amber px-3 active:translate-y-px">
					sign in
				</a>
				{/* oxlint-disable-next-line nextjs/no-html-link-for-pages */}
				<a href="/sign-up" className="text-dim transition-colors hover:text-ice">
					create an account
				</a>
			</div>
		</section>
	);
}
