"use client";

import { useUIMessages, useSmoothText } from "@convex-dev/agent/react";
import { useMutation } from "convex/react";
import { useCallback, useState } from "react";
import { api } from "../../convex/_generated/api";

export function Chat() {
	const [threadId, setThreadId] = useState<string | null>(null);
	const [prompt, setPrompt] = useState("");
	const createThread = useMutation(api.chat.mutations.createThreadMutation);
	const sendMessage = useMutation(api.chat.mutations.sendMessage);

	const { results: messages, status } = useUIMessages(
		api.chat.queries.listThreadMessages,
		threadId ? { threadId } : "skip",
		{ initialNumItems: 20, stream: true }
	);

	const handleStartChat = useCallback(async () => {
		const { threadId: id } = await createThread({});
		setThreadId(id);
	}, [createThread]);

	const handleSend = useCallback(
		async (e: React.FormEvent) => {
			e.preventDefault();
			const text = prompt.trim();
			if (!text) return;
			setPrompt("");
			if (!threadId) {
				const { threadId: id } = await createThread({});
				setThreadId(id);
				await sendMessage({ threadId: id, prompt: text });
			} else {
				await sendMessage({ threadId, prompt: text });
			}
		},
		[prompt, threadId, createThread, sendMessage]
	);

	if (!threadId && messages && messages.length === 0) {
		return (
			<div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
				<p className="text-zinc-400 mb-4">
					Start a conversation with the AI assistant.
				</p>
				<button
					onClick={() => void handleStartChat()}
					className="px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-900 font-medium transition-colors"
				>
					Start chat
				</button>
			</div>
		);
	}

	return (
		<div className="rounded-xl border border-zinc-800 bg-zinc-900/50 flex flex-col min-h-[320px]">
			<div className="flex-1 overflow-y-auto p-4 space-y-4">
				{messages?.map((message) => (
					<ChatMessage key={message.key} message={message} />
				))}
				{status === "LoadingFirstPage" && messages?.length === 0 && (
					<p className="text-zinc-500 text-sm">Loading…</p>
				)}
			</div>
			<form onSubmit={(e) => void handleSend(e)} className="p-4 border-t border-zinc-800">
				<div className="flex gap-2">
					<input
						type="text"
						value={prompt}
						onChange={(e) => setPrompt(e.target.value)}
						placeholder="Type a message…"
						className="flex-1 px-4 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
					/>
					<button
						type="submit"
						disabled={!prompt.trim()}
						className="px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-900 font-medium transition-colors"
					>
						Send
					</button>
				</div>
			</form>
		</div>
	);
}

function ChatMessage({
	message,
}: {
	message: { role: string; text: string; status?: string };
}) {
	const [visibleText] = useSmoothText(message.text, {
		startStreaming: message.status === "streaming",
	});

	const isUser = message.role === "user";
	return (
		<div
			className={`flex ${isUser ? "justify-end" : "justify-start"}`}
		>
			<div
				className={`max-w-[85%] rounded-lg px-4 py-2 ${
					isUser
						? "bg-amber-500/20 text-amber-100"
						: "bg-zinc-800 text-zinc-200"
				}`}
			>
				<p className="text-sm whitespace-pre-wrap">
					{isUser ? message.text : visibleText}
				</p>
			</div>
		</div>
	);
}
