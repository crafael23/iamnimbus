"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { SkeletonRows } from "./KnowledgePanel";
import {
	Button,
	errorMessage,
	Field,
	inputClass,
	MarkdownEditor,
	PanelHeader,
	slugify,
	StatusBadge,
} from "./ui";

export function ProjectsPanel() {
	const projects = useQuery(api.projects.queries.list);
	const [editing, setEditing] = useState<Id<"projects"> | "new" | null>(null);

	if (editing) return <ProjectEditor projectId={editing} onClose={() => setEditing(null)} />;

	return (
		<div>
			<PanelHeader
				title="Projects"
				description="Structured write-ups shown at /projects. Each save re-indexes the project for the terminal."
				action={
					<Button tone="primary" onClick={() => setEditing("new")}>
						New project
					</Button>
				}
			/>
			{projects === undefined ? (
				<SkeletonRows />
			) : projects.length === 0 ? (
				<p className="border border-dashed border-line p-8 text-[13px] text-fog">
					No projects yet. Add one with <span className="text-cyan">New project</span>.
				</p>
			) : (
				<ul className="divide-y divide-line border-y border-line">
					{projects.map((p) => (
						<li key={p._id}>
							<button
								type="button"
								onClick={() => setEditing(p._id)}
								className="grid w-full gap-1 py-3.5 text-left transition-colors hover:bg-deep/60 sm:grid-cols-[1fr_auto] sm:items-center sm:px-2"
							>
								<span className="min-w-0">
									<span className="block truncate text-[14px] text-ice">{p.title}</span>
									<span className="block truncate text-[12px] text-dim">{p.stack.join(", ")}</span>
								</span>
								<span className="text-[12px] text-dim">/projects/{p.slug}</span>
							</button>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

function ProjectEditor({ projectId, onClose }: { projectId: Id<"projects"> | "new"; onClose: () => void }) {
	const project = useQuery(api.projects.queries.adminGet, projectId === "new" ? "skip" : { projectId });
	if (projectId !== "new" && project === undefined) return <SkeletonRows />;
	return <ProjectForm key={project?._id ?? "new"} project={project ?? null} onClose={onClose} />;
}

const LONG_FIELDS = [
	["problem", "Problem", "What was wrong, for whom, and why it mattered."],
	["solution", "Solution", "What was built."],
	["decisions", "Key decisions", "The judgment calls and their trade-offs."],
	["outcome", "Outcome", "What happened. What you would do differently."],
] as const;

function ProjectForm({ project, onClose }: { project: Doc<"projects"> | null; onClose: () => void }) {
	const [form, setForm] = useState({
		title: project?.title ?? "",
		slug: project?.slug ?? "",
		summary: project?.summary ?? "",
		problem: project?.problem ?? "",
		solution: project?.solution ?? "",
		decisions: project?.decisions ?? "",
		outcome: project?.outcome ?? "",
		stack: project?.stack.join(", ") ?? "",
		year: project?.year ?? "",
		repoUrl: project?.repoUrl ?? "",
		liveUrl: project?.liveUrl ?? "",
		order: project?.order ?? 0,
	});
	const [slugTouched, setSlugTouched] = useState(Boolean(project));
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const save = useMutation(api.projects.mutations.save);
	const remove = useMutation(api.projects.mutations.remove);
	const index = useQuery(
		api.knowledge.queries.statusForSource,
		project ? { source: "project", sourceKey: project._id } : "skip",
	);

	const submit = async () => {
		setBusy(true);
		setError(null);
		try {
			await save({
				projectId: project?._id,
				...form,
				stack: form.stack.split(","),
				year: form.year.trim() || undefined,
				repoUrl: form.repoUrl.trim() || undefined,
				liveUrl: form.liveUrl.trim() || undefined,
				order: Number(form.order) || 0,
			});
			onClose();
		} catch (e) {
			setError(errorMessage(e));
		} finally {
			setBusy(false);
		}
	};

	const set = (key: keyof typeof form) => (value: string) => setForm({ ...form, [key]: value });

	return (
		<div>
			<PanelHeader
				title={project ? "Edit project" : "New project"}
				description="Every field is Markdown except the short ones. The terminal reads all of it."
				action={index ? <StatusBadge status={index.status} chunks={index.chunkCount} error={index.error} /> : undefined}
			/>
			<div className="grid gap-5">
				<div className="grid gap-5 sm:grid-cols-2">
					<Field label="Title" htmlFor="p-title">
						<input
							id="p-title"
							value={form.title}
							onChange={(e) =>
								setForm({ ...form, title: e.target.value, slug: slugTouched ? form.slug : slugify(e.target.value) })
							}
							className={inputClass}
						/>
					</Field>
					<Field label="Slug" htmlFor="p-slug" hint={`/projects/${form.slug || "…"}`}>
						<input
							id="p-slug"
							value={form.slug}
							onChange={(e) => {
								setSlugTouched(true);
								set("slug")(e.target.value);
							}}
							className={inputClass}
						/>
					</Field>
				</div>
				<Field label="Summary" htmlFor="p-summary" hint="One sentence for the index card.">
					<input id="p-summary" value={form.summary} onChange={(e) => set("summary")(e.target.value)} className={inputClass} />
				</Field>
				<div className="grid gap-5 sm:grid-cols-[1fr_7rem_7rem]">
					<Field label="Stack" htmlFor="p-stack" hint="Comma separated.">
						<input id="p-stack" value={form.stack} onChange={(e) => set("stack")(e.target.value)} className={inputClass} />
					</Field>
					<Field label="Year" htmlFor="p-year">
						<input id="p-year" value={form.year} onChange={(e) => set("year")(e.target.value)} className={inputClass} />
					</Field>
					<Field label="Order" htmlFor="p-order" hint="Lower first.">
						<input
							id="p-order"
							type="number"
							value={form.order}
							onChange={(e) => setForm({ ...form, order: Number(e.target.value) })}
							className={inputClass}
						/>
					</Field>
				</div>
				<div className="grid gap-5 sm:grid-cols-2">
					<Field label="Repository URL" htmlFor="p-repo">
						<input id="p-repo" value={form.repoUrl} onChange={(e) => set("repoUrl")(e.target.value)} placeholder="https://" className={inputClass} />
					</Field>
					<Field label="Live URL" htmlFor="p-live">
						<input id="p-live" value={form.liveUrl} onChange={(e) => set("liveUrl")(e.target.value)} placeholder="https://" className={inputClass} />
					</Field>
				</div>
				{LONG_FIELDS.map(([key, label, hint]) => (
					<Field key={key} label={label} htmlFor={`p-${key}`} hint={hint}>
						<MarkdownEditor id={`p-${key}`} value={form[key]} onChange={set(key)} rows={8} />
					</Field>
				))}
				{error && <p className="text-[13px] text-danger">{error}</p>}
				<div className="flex flex-wrap gap-2">
					<Button tone="primary" onClick={() => void submit()} disabled={busy || !form.title.trim()}>
						{busy ? "Saving…" : "Save and index"}
					</Button>
					<Button tone="ghost" onClick={onClose}>
						Cancel
					</Button>
					<span className="flex-1" />
					{project && (
						<Button
							tone="danger"
							onClick={() => {
								if (window.confirm("Delete this project and remove it from the terminal's memory?")) {
									remove({ projectId: project._id }).then(onClose, (e) => setError(errorMessage(e)));
								}
							}}
						>
							Delete
						</Button>
					)}
				</div>
			</div>
		</div>
	);
}
