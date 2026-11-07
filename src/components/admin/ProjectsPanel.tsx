"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { SkeletonRows } from "./KnowledgePanel";
import { Button, Field, inputClass, MarkdownEditor, PanelHeader, StatusBadge } from "./ui";
import { TitleSlugFields } from "./TitleSlugFields";
import { errorMessage } from "./utils";

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

function initialProjectForm(project: Doc<"projects"> | null) {
	return {
		title: project?.title ?? "",
		slug: project?.slug ?? "",
		summary: project?.summary ?? "",
		problem: project?.problem ?? "",
		solution: project?.solution ?? "",
		decisions: project?.decisions ?? "",
		outcome: project?.outcome ?? "",
		stack: project?.stack.join(", ") ?? "",
		year: project?.year ?? "",
		githubRepo: project?.githubRepo ?? "",
		repoUrl: project?.repoUrl ?? "",
		liveUrl: project?.liveUrl ?? "",
		order: String(project?.order ?? 0),
	};
}

type ProjectFormState = ReturnType<typeof initialProjectForm>;

/** The form as the save mutation takes it: blanks become undefined, order a number. */
function projectFields(projectId: Id<"projects"> | undefined, form: ProjectFormState) {
	const order = Number(form.order);
	return {
		projectId,
		...form,
		stack: form.stack.split(","),
		year: form.year.trim() || undefined,
		githubRepo: form.githubRepo || undefined,
		repoUrl: form.githubRepo ? undefined : form.repoUrl.trim() || undefined,
		liveUrl: form.liveUrl.trim() || undefined,
		order: Number.isFinite(order) ? order : 0,
	};
}

function ProjectForm({ project, onClose }: { project: Doc<"projects"> | null; onClose: () => void }) {
	const [form, setForm] = useState(() => initialProjectForm(project));
	// Only read while typing the title: changing it never needs a render.
	const slugTouched = useRef(Boolean(project));
	const index = useQuery(
		api.knowledge.queries.statusForSource,
		project ? { source: "project", sourceKey: project._id } : "skip",
	);

	const set = (key: keyof typeof form) => (value: string) => setForm({ ...form, [key]: value });

	return (
		<div>
			<PanelHeader
				title={project ? "Edit project" : "New project"}
				description="Every field is Markdown except the short ones. The terminal reads all of it."
				action={index ? <StatusBadge status={index.status} chunks={index.chunkCount} error={index.error} /> : undefined}
			/>
			<div className="grid gap-5">
				<TitleSlugFields
					idPrefix="p"
					basePath="/projects/"
					title={form.title}
					slug={form.slug}
					slugTouchedRef={slugTouched}
					onChange={(next) => setForm({ ...form, ...next })}
				/>
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
							onChange={(e) => set("order")(e.target.value)}
							className={inputClass}
						/>
					</Field>
				</div>
				<div className="grid gap-5 sm:grid-cols-2">
					<RepoPicker projectId={project?._id} value={form.githubRepo} onChange={set("githubRepo")} />
					<Field label="Live URL" htmlFor="p-live">
						<input id="p-live" value={form.liveUrl} onChange={(e) => set("liveUrl")(e.target.value)} placeholder="https://" className={inputClass} />
					</Field>
					{!form.githubRepo && (
						<Field label="Other repository URL" htmlFor="p-repo" hint="For code that is not in your GitHub sync.">
							<input id="p-repo" value={form.repoUrl} onChange={(e) => set("repoUrl")(e.target.value)} placeholder="https://" className={inputClass} />
						</Field>
					)}
				</div>
				{LONG_FIELDS.map(([key, label, hint]) => (
					<Field key={key} label={label} htmlFor={`p-${key}`} hint={hint}>
						<MarkdownEditor id={`p-${key}`} value={form[key]} onChange={set(key)} rows={8} />
					</Field>
				))}
				<ProjectActions projectId={project?._id} form={form} onClose={onClose} />
			</div>
		</div>
	);
}

type SyncedRepo = FunctionReturnType<typeof api.github.queries.repos>[number];

function repoHint(repos: SyncedRepo[] | undefined) {
	if (repos === undefined) return "Loading synced repositories…";
	return repos.length === 0
		? "Run a GitHub sync to choose a repository."
		: "One repository per project. Its details show on the project page.";
}

/** One repository per project: a repo linked to another project shows that project and can't be picked. */
function RepoPicker({
	projectId,
	value,
	onChange,
}: {
	projectId: Id<"projects"> | undefined;
	value: string;
	onChange: (value: string) => void;
}) {
	const repos = useQuery(api.github.queries.repos);
	const takenBy = (r: SyncedRepo) => (r.linkedProject && r.linkedProject._id !== projectId ? r.linkedProject.title : null);
	const missing = Boolean(value) && repos !== undefined && !repos.some((r) => r.fullName === value);

	return (
		<Field label="GitHub repository" htmlFor="p-github" hint={repoHint(repos)}>
			<select id="p-github" value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
				<option value="">None</option>
				{repos?.map((r) => (
					<option key={r.fullName} value={r.fullName} disabled={Boolean(takenBy(r))}>
						{r.label}
						{takenBy(r) ? ` (linked to ${takenBy(r)})` : ""}
					</option>
				))}
				{missing && <option value={value}>{value} (not in the last sync)</option>}
			</select>
		</Field>
	);
}

function ProjectActions({
	projectId,
	form,
	onClose,
}: {
	projectId: Id<"projects"> | undefined;
	form: ProjectFormState;
	onClose: () => void;
}) {
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const save = useMutation(api.projects.mutations.save);
	const remove = useMutation(api.projects.mutations.remove);

	const submit = async () => {
		const fields = projectFields(projectId, form);
		setBusy(true);
		setError(null);
		try {
			await save(fields);
			onClose();
		} catch (e) {
			setError(errorMessage(e));
		}
		setBusy(false);
	};

	return (
		<>
			{error && <p className="text-[13px] text-danger">{error}</p>}
			<div className="flex flex-wrap gap-2">
				<Button tone="primary" onClick={() => void submit()} disabled={busy || !form.title.trim()}>
					{busy ? "Saving…" : "Save and index"}
				</Button>
				<Button tone="ghost" onClick={onClose}>
					Cancel
				</Button>
				<span className="flex-1" />
				{projectId && (
					<Button
						tone="danger"
						onClick={() => {
							if (window.confirm("Delete this project and remove it from the terminal's memory?")) {
								remove({ projectId }).then(onClose, (e) => setError(errorMessage(e)));
							}
						}}
					>
						Delete
					</Button>
				)}
			</div>
		</>
	);
}
