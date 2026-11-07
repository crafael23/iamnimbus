"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { type AsOf, asOfLabel } from "../../../convex/_lib/asOf";
import { Button, Field, inputClass, MarkdownEditor, PanelHeader, StatusBadge } from "./ui";
import { errorMessage, formatTime } from "./utils";

const NAMESPACES = ["projects", "history", "skills", "goals", "blog", "github"] as const;
type Namespace = (typeof NAMESPACES)[number];

export function KnowledgePanel() {
	const [filter, setFilter] = useState<Namespace | "all">("all");
	const [editing, setEditing] = useState<Id<"knowledgeDocs"> | "new" | null>(null);
	const docs = useQuery(api.knowledge.queries.list, filter === "all" ? {} : { namespace: filter });
	const reingest = useMutation(api.knowledge.mutations.reingest);
	const remove = useMutation(api.knowledge.mutations.remove);
	const [error, setError] = useState<string | null>(null);

	if (editing) {
		return <KnowledgeEditor docId={editing} onClose={() => setEditing(null)} />;
	}

	return (
		<div>
			<PanelHeader
				title="Knowledge base"
				description="Everything the terminal can retrieve. Saving a document re-chunks and re-embeds it. Blog, project and GitHub documents follow their source and are edited there."
				action={
					<Button tone="primary" onClick={() => setEditing("new")}>
						New document
					</Button>
				}
			/>
			<fieldset className="mb-5 flex flex-wrap gap-1.5">
				<legend className="sr-only">Filter by namespace</legend>
				{(["all", ...NAMESPACES] as const).map((ns) => (
					<button
						key={ns}
						type="button"
						aria-pressed={filter === ns}
						onClick={() => setFilter(ns)}
						className={`border px-2.5 py-1 text-[12px] transition-colors ${
							filter === ns ? "border-cyan/60 text-cyan" : "border-line text-dim hover:text-ice"
						}`}
					>
						{ns}
					</button>
				))}
			</fieldset>
			{error && <p className="mb-4 text-[13px] text-danger">{error}</p>}
			{docs === undefined ? (
				<SkeletonRows />
			) : docs.length === 0 ? (
				<p className="border border-dashed border-line p-8 text-[13px] text-fog">
					No documents in {filter === "all" ? "the knowledge base" : filter} yet. Write one with{" "}
					<span className="text-cyan">New document</span>.
				</p>
			) : (
				<ul className="divide-y divide-line border-y border-line">
					{docs.map((doc) => (
						<li key={doc._id} className="grid gap-2 py-3.5 sm:grid-cols-[1fr_9rem_10rem_auto] sm:items-center sm:gap-4">
							<div className="min-w-0">
								<p className="truncate text-[14px] text-ice">{doc.title}</p>
								<p className="mt-0.5 text-[12px] text-dim">
									{doc.namespace}
									{doc.source !== "manual" && ` / from ${doc.source}`}
									{` / ${Math.max(1, Math.round(doc.length / 1000))}k chars`}
									{doc.asOf !== undefined && ` / ${asOfLabel(doc.asOf)}`}
								</p>
							</div>
							<StatusBadge status={doc.status} chunks={doc.chunkCount} error={doc.error} />
							<span className="text-[12px] text-dim">{formatTime(doc.updatedAt)}</span>
							<div className="flex gap-1">
								{doc.source === "manual" && (
									<Button tone="ghost" onClick={() => setEditing(doc._id)}>
										Edit
									</Button>
								)}
								<Button
									tone="ghost"
									onClick={() => {
										reingest({ docId: doc._id }).catch((e) => setError(errorMessage(e)));
									}}
								>
									Re-index
								</Button>
								{doc.source === "manual" && (
									<Button
										tone="ghost"
										className="hover:text-danger"
										onClick={() => {
											if (window.confirm(`Delete "${doc.title}" and its vectors?`)) {
												remove({ docId: doc._id }).catch((e) => setError(errorMessage(e)));
											}
										}}
									>
										Delete
									</Button>
								)}
							</div>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

function KnowledgeEditor({ docId, onClose }: { docId: Id<"knowledgeDocs"> | "new"; onClose: () => void }) {
	const existing = useQuery(api.knowledge.queries.get, docId === "new" ? "skip" : { docId });
	if (docId !== "new" && existing === undefined) return <SkeletonRows />;
	return (
		<KnowledgeForm
			key={existing?._id ?? "new"}
			docId={docId === "new" ? null : docId}
			initial={{
				namespace: (existing?.namespace ?? "history") as Namespace,
				title: existing?.title ?? "",
				content: existing?.content ?? "",
				asOf: formatAsOf(existing?.asOf),
			}}
			status={existing ? { status: existing.status, chunks: existing.chunkCount, error: existing.error } : null}
			onClose={onClose}
		/>
	);
}

function KnowledgeForm({
	docId,
	initial,
	status,
	onClose,
}: {
	docId: Id<"knowledgeDocs"> | null;
	initial: { namespace: Namespace; title: string; content: string; asOf: string };
	status: { status: "pending" | "ready" | "error"; chunks?: number; error?: string } | null;
	onClose: () => void;
}) {
	const [form, setForm] = useState(initial);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const create = useMutation(api.knowledge.mutations.create);
	const update = useMutation(api.knowledge.mutations.update);

	const save = async () => {
		const asOf = parseAsOf(form.asOf);
		if (asOf === null) {
			setError("Write the as-of date as YYYY or YYYY-MM, or the word current.");
			return;
		}
		const fields = { title: form.title, content: form.content, asOf };
		setSaving(true);
		setError(null);
		try {
			if (docId) await update({ docId, ...fields });
			else await create({ namespace: form.namespace, ...fields });
			onClose();
		} catch (e) {
			setError(errorMessage(e));
		}
		setSaving(false);
	};

	return (
		<div>
			<PanelHeader
				title={docId ? "Edit document" : "New document"}
				description="Markdown. Headings and short sections chunk best: each chunk should make sense on its own."
				action={status ? <StatusBadge status={status.status} chunks={status.chunks} error={status.error} /> : undefined}
			/>
			<div className="grid gap-5">
				<div className="grid gap-5 sm:grid-cols-[12rem_1fr_10rem]">
					<Field label="Namespace" htmlFor="kb-namespace" hint={docId ? "Fixed after creation." : undefined}>
						<select
							id="kb-namespace"
							value={form.namespace}
							disabled={Boolean(docId)}
							onChange={(e) => setForm({ ...form, namespace: e.target.value as Namespace })}
							className={inputClass}
						>
							{NAMESPACES.filter((n) => n !== "blog" && n !== "github").map((n) => (
								<option key={n} value={n}>
									{n}
								</option>
							))}
						</select>
					</Field>
					<Field label="Title" htmlFor="kb-title">
						<input
							id="kb-title"
							value={form.title}
							onChange={(e) => setForm({ ...form, title: e.target.value })}
							className={inputClass}
						/>
					</Field>
					<Field label="As of" htmlFor="kb-as-of" hint="YYYY-MM, or current. Recent work ranks higher.">
						<input
							id="kb-as-of"
							value={form.asOf}
							placeholder="2024-03"
							onChange={(e) => setForm({ ...form, asOf: e.target.value })}
							className={inputClass}
						/>
					</Field>
				</div>
				<Field label="Content" htmlFor="kb-content">
					<MarkdownEditor id="kb-content" value={form.content} onChange={(content) => setForm({ ...form, content })} />
				</Field>
				{error && <p className="text-[13px] text-danger">{error}</p>}
				<div className="flex gap-2">
					<Button tone="primary" onClick={() => void save()} disabled={saving || !form.title.trim()}>
						{saving ? "Saving…" : docId ? "Save" : "Save and index"}
					</Button>
					<Button tone="ghost" onClick={onClose}>
						Cancel
					</Button>
				</div>
			</div>
		</div>
	);
}

function formatAsOf(asOf: AsOf | undefined) {
	if (asOf === undefined) return "";
	if (asOf === "current") return "current";
	return new Date(asOf).toISOString().slice(0, 7);
}

/** undefined for blank, null when it can't be read. */
function parseAsOf(text: string): AsOf | undefined | null {
	const value = text.trim();
	if (!value) return undefined;
	if (/^current$/i.test(value)) return "current";
	const match = value.match(/^(\d{4})(?:-(\d{1,2}))?$/);
	if (!match) return null;
	const month = match[2] ? Number(match[2]) : 7;
	if (month < 1 || month > 12) return null;
	return Date.UTC(Number(match[1]), month - 1, 1);
}

export function SkeletonRows() {
	return (
		<div className="space-y-px" aria-hidden>
			{[0, 1, 2].map((i) => (
				<div key={i} className="h-14 animate-pulse bg-deep" />
			))}
		</div>
	);
}
