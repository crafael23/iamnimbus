"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { type CommandSpec, matchCommands } from "./commands";

/**
 * The prompt at the foot of the terminal, with the command list that opens
 * as the visitor types `/`. It owns what is being typed; the terminal decides
 * what a message does.
 */
export function PromptDock({
	scroller,
	ready,
	replying,
	canSend,
	onSend,
}: {
	/** The scrolling transcript, to decide which way the command list opens. */
	scroller: RefObject<HTMLDivElement | null>;
	/** Whether a thread is open to receive messages. */
	ready: boolean;
	replying: boolean;
	/** Whether this text can be sent right now; if not, it stays in the box. */
	canSend: (text: string) => boolean;
	/** Send the text; resolves to text to put back in the box, if any. */
	onSend: (text: string) => Promise<string | null>;
}) {
	const [input, setInput] = useState("");
	const [selected, setSelected] = useState(0);
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const suggestions = matchCommands(input);
	const showSuggestions = suggestions.length > 0 && input !== suggestions[0]?.name;

	useEffect(() => {
		inputRef.current?.focus({ preventScroll: true });
	}, []);

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
	}, [showSuggestions, suggestions.length, scroller]);

	const submit = async (raw: string) => {
		const text = raw.trim();
		// Keep the text in the box until the thread is ready to receive it.
		if (!text || !canSend(text)) return;
		setInput("");
		setSelected(0);
		const back = await onSend(text);
		if (back !== null) setInput(back);
	};

	const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
		if (showSuggestions && pickWithKeys(e)) return;
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			if (!replying) void submit(input);
		}
	};

	/** Arrow keys move through the list, Tab completes, Enter runs, Escape clears. */
	const pickWithKeys = (e: KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "ArrowDown" || e.key === "ArrowUp") {
			e.preventDefault();
			const delta = e.key === "ArrowDown" ? 1 : -1;
			setSelected((i) => (i + delta + suggestions.length) % suggestions.length);
			return true;
		}
		if (e.key === "Tab" || e.key === "Enter") {
			e.preventDefault();
			const pick = suggestions[selected] ?? suggestions[0];
			if (!pick) return true;
			if (e.key === "Enter") void submit(pick.name);
			else setInput(pick.name);
			return true;
		}
		if (e.key === "Escape") {
			setInput("");
			return true;
		}
		return false;
	};

	let placeholder = "ask a question, or type /";
	if (!ready) placeholder = "connecting…";
	else if (replying) placeholder = "receiving…";

	return (
		<div className="sticky bottom-0 z-10 mt-8 w-full bg-gradient-to-t from-void from-70% to-transparent px-5 pb-[max(env(safe-area-inset-bottom),16px)] pt-6 sm:px-10 sm:pb-10">
			<div ref={dock} className="relative mx-auto max-w-[860px]">
				{/* Floats over the text so opening it never moves the input. */}
				{showSuggestions && (
					<CommandList
						listRef={list}
						commands={suggestions}
						selected={selected}
						below={listBelow}
						onPick={(name) => void submit(name)}
					/>
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
						placeholder={placeholder}
						aria-describedby={showSuggestions ? "command-list" : undefined}
						autoComplete="off"
						spellCheck={false}
						className="max-h-40 min-h-[1.3em] w-full resize-none bg-transparent text-[20px] leading-[1.3] text-ice caret-cyan outline-none [caret-shape:block] [field-sizing:content] placeholder:text-dim focus-visible:outline-none sm:text-[22px]"
					/>
					<button
						type="submit"
						disabled={replying || !ready || !input.trim()}
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
	);
}

function CommandList({
	listRef,
	commands,
	selected,
	below,
	onPick,
}: {
	listRef: RefObject<HTMLUListElement | null>;
	commands: CommandSpec[];
	selected: number;
	below: boolean;
	onPick: (name: string) => void;
}) {
	return (
		<ul
			ref={listRef}
			id="command-list"
			aria-label="Commands"
			className={`crt-text absolute inset-x-0 z-20 border border-line bg-void/95 py-1 text-[19px] sm:text-[20px] ${
				below ? "top-full mt-2" : "bottom-full mb-2"
			}`}
		>
			{commands.map((c, i) => (
				<li key={c.name}>
					<button
						type="button"
						tabIndex={-1}
						aria-current={i === selected ? "true" : undefined}
						onPointerDown={(e) => {
							e.preventDefault();
							onPick(c.name);
						}}
						className={`flex w-full gap-4 px-2 py-0.5 text-left ${i === selected ? "reverse" : "text-fog"}`}
					>
						<span className="w-[10ch] shrink-0">{c.name}</span>
						<span className={i === selected ? "" : "text-dim"}>{c.hint}</span>
						{c.local && <span className={`ml-auto uppercase ${i === selected ? "" : "text-dim/70"}`}>local</span>}
					</button>
				</li>
			))}
		</ul>
	);
}
