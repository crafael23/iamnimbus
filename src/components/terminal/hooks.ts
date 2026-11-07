import { useUIMessages } from "@convex-dev/agent/react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from "react";
import { api } from "../../../convex/_generated/api";
import { guestToken } from "./guestToken";
import { hasBooted, markBooted, savedGuestThread, saveGuestThread } from "./storage";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const onMotionChange = (change: () => void) => {
	const query = window.matchMedia(REDUCED_MOTION);
	query.addEventListener("change", change);
	return () => query.removeEventListener("change", change);
};
const prefersReducedMotion = () => window.matchMedia(REDUCED_MOTION).matches;
const serverMotion = () => false;

/**
 * The boot, once per session: the first visit opens on the dusty screen
 * (DustIntro) and plays the boot lines once it reveals the terminal.
 */
export function useBoot() {
	const reducedMotion = useSyncExternalStore(onMotionChange, prefersReducedMotion, serverMotion);
	const [booted, setBooted] = useState(() => hasBooted() || reducedMotion);
	const [done, setDone] = useState(booted);
	const [intro] = useState(() => !booted);
	const [revealed, setRevealed] = useState(!intro);
	const reveal = useCallback(() => setRevealed(true), []);
	const finish = useCallback(() => {
		markBooted();
		setBooted(true);
		setDone(true);
	}, []);
	let mode: "instant" | "play" | "held" = "held";
	if (booted) mode = "instant";
	else if (revealed) mode = "play";
	return { intro, done, mode, reveal, finish };
}

/**
 * The visitor's thread: a signed guest link for guests, then the thread
 * opened (or resumed) whenever the auth state settles, and its messages.
 */
export function useChatThread(onOpen: (threadId: string) => void) {
	const { isLoading: authLoading, isAuthenticated } = useConvexAuth();
	const [threadId, setThreadId] = useState<string | null>(null);
	/**
	 * The guest token reads subscribe with. Kept for the page's life (the
	 * server accepts it for reads after expiry); writes fetch a current one.
	 */
	const [readToken, setReadToken] = useState<string | null>(null);
	const [linkFailed, setLinkFailed] = useState(false);
	const startThread = useMutation(api.chat.mutations.startThread);

	const asGuest = !authLoading && !isAuthenticated;
	const tokenArg = asGuest ? (readToken ?? undefined) : undefined;
	const waiting = authLoading || (asGuest && !readToken);
	const session = useQuery(api.chat.queries.session, waiting ? "skip" : { guestToken: tokenArg });

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

	const opened = useEffectEvent(onOpen);
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
				opened(id);
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

	return { threadId, session, messages, linkFailed, isAuthenticated };
}

/**
 * Record a guest who signs in. On a first sign-in the WorkOS webhook may not
 * have created the user row yet, and convertGuest needs it: wait until the
 * profile exists.
 */
export function useGuestConversion(isAuthenticated: boolean) {
	const sent = useRef(false);
	const convertGuest = useMutation(api.analytics.mutations.convertGuest);
	const profile = useQuery(api.users.queries.getMyProfileOrNull, isAuthenticated ? {} : "skip");
	useEffect(() => {
		if (!profile || sent.current) return;
		sent.current = true;
		void guestToken()
			.then((token) => convertGuest({ guestToken: token }))
			.catch(() => {});
	}, [profile, convertGuest]);
}

/** Stick to the bottom while new output arrives, unless the reader scrolled up. */
export function useStickToBottom() {
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
	/** Follow the conversation down again, e.g. after the visitor sends something. */
	const pin = useCallback(() => {
		stick.current = true;
	}, []);
	return { scroller, content, onScroll, pin };
}
