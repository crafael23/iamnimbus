"use client";

import { ConvexError } from "convex/values";
import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Markdown } from "@/components/Markdown";

/** Calm admin primitives: same palette as the terminal, less glow. */

export function Button({
	tone = "default",
	className = "",
	...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
	tone?: "default" | "primary" | "danger" | "ghost";
}) {
	const tones = {
		default: "border-line-strong text-ice hover:border-cyan-dim hover:text-cyan",
		primary: "border-cyan/70 bg-cyan/10 text-cyan hover:bg-cyan/20",
		danger: "border-danger/50 text-danger hover:bg-danger/10",
		ghost: "border-transparent text-fog hover:text-ice",
	} as const;
	return (
		<button
			type="button"
			{...props}
			className={`inline-flex h-9 items-center gap-2 whitespace-nowrap border px-3.5 text-[13px] transition-colors active:translate-y-px disabled:pointer-events-none disabled:opacity-40 ${tones[tone]} ${className}`}
		/>
	);
}

export function Field({
	label,
	htmlFor,
	hint,
	children,
}: {
	label: string;
	htmlFor: string;
	hint?: string;
	children: ReactNode;
}) {
	return (
		<div className="flex flex-col gap-2">
			<label htmlFor={htmlFor} className="text-[12px] text-fog">
				{label}
			</label>
			{children}
			{hint && <p className="text-[12px] text-dim">{hint}</p>}
		</div>
	);
}

export const inputClass =
	"w-full border border-line bg-deep px-3 py-2 text-[14px] text-ice placeholder:text-dim focus:border-cyan-dim focus:outline-none";

export function StatusBadge({
	status,
	chunks,
	error,
}: {
	status: "pending" | "ready" | "error" | "draft" | "published";
	chunks?: number | null;
	error?: string | null;
}) {
	const styles = {
		pending: "text-amber",
		ready: "text-cyan",
		error: "text-danger",
		draft: "text-fog",
		published: "text-cyan",
	} as const;
	const label =
		status === "pending"
			? "indexing…"
			: status === "ready"
				? `indexed${chunks != null ? `, ${chunks} chunk${chunks === 1 ? "" : "s"}` : ""}`
				: status === "error"
					? "index failed"
					: status;
	return (
		<span className={`text-[12px] ${styles[status]}`} title={error ?? undefined}>
			{label}
		</span>
	);
}

export function MarkdownEditor({
	id,
	value,
	onChange,
	rows = 18,
}: {
	id: string;
	value: string;
	onChange: (v: string) => void;
	rows?: number;
}) {
	const [tab, setTab] = useState<"write" | "preview">("write");
	return (
		<div className="border border-line">
			<div className="flex items-center gap-1 border-b border-line bg-deep px-2 lg:hidden">
				{(["write", "preview"] as const).map((t) => (
					<button
						key={t}
						type="button"
						onClick={() => setTab(t)}
						aria-pressed={tab === t}
						className={`px-2 py-1.5 text-[12px] ${tab === t ? "text-cyan" : "text-dim"}`}
					>
						{t}
					</button>
				))}
			</div>
			<div className="grid lg:grid-cols-2">
				<textarea
					id={id}
					value={value}
					rows={rows}
					onChange={(e) => onChange(e.target.value)}
					spellCheck
					style={{ minHeight: `${rows * 1.3}rem` }}
					className={`${tab === "write" ? "block" : "hidden"} w-full resize-y bg-void p-4 font-mono text-[13px] leading-relaxed text-ice focus:outline-none lg:block lg:border-r lg:border-line`}
				/>
				<div
					style={{ minHeight: `${rows * 1.3}rem` }}
					className={`${tab === "preview" ? "block" : "hidden"} max-h-[38rem] overflow-y-auto bg-deep/50 p-5 lg:block`}
				>
					<p className="mb-3 hidden text-[11px] text-dim lg:block">preview</p>
					{value.trim() ? (
						<Markdown variant="prose">{value}</Markdown>
					) : (
						<p className="text-[13px] text-dim">Nothing to preview yet.</p>
					)}
				</div>
			</div>
		</div>
	);
}

export function errorMessage(error: unknown) {
	if (error instanceof ConvexError) {
		return typeof error.data === "string" ? error.data : JSON.stringify(error.data);
	}
	return error instanceof Error ? error.message : "Something went wrong";
}

export function slugify(title: string) {
	return title
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80);
}

export function formatTime(ms: number) {
	return new Date(ms).toLocaleString("en-US", {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

export function PanelHeader({
	title,
	description,
	action,
}: {
	title: string;
	description: string;
	action?: ReactNode;
}) {
	return (
		<div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
			<div>
				<h1 className="font-display text-xl text-ice">{title}</h1>
				<p className="mt-2 max-w-[60ch] text-[13px] leading-relaxed text-fog">{description}</p>
			</div>
			{action}
		</div>
	);
}
