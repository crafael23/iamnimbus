"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { SkeletonRows } from "./KnowledgePanel";
import { Button, errorMessage, Field, formatTime, inputClass, PanelHeader } from "./ui";

export function PromptPanel() {
	const versions = useQuery(api.prompts.queries.listVersions);
	if (versions === undefined) return <SkeletonRows />;
	const active = versions[0] ?? null;
	return <PromptEditor key={active?._id ?? "none"} versions={versions} />;
}

type Version = NonNullable<ReturnType<typeof useQuery<typeof api.prompts.queries.listVersions>>>[number];

function PromptEditor({ versions }: { versions: Version[] }) {
	const active = versions[0] ?? null;
	const [content, setContent] = useState(active?.content ?? "");
	const [note, setNote] = useState("");
	const [viewing, setViewing] = useState<Id<"systemPromptVersions"> | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const save = useMutation(api.prompts.mutations.save);
	const restore = useMutation(api.prompts.mutations.restore);
	const dirty = content !== (active?.content ?? "");
	const viewed = versions.find((v) => v._id === viewing) ?? null;

	const run = async (fn: () => Promise<unknown>) => {
		setBusy(true);
		setError(null);
		try {
			await fn();
		} catch (e) {
			setError(errorMessage(e));
		} finally {
			setBusy(false);
		}
	};

	return (
		<div>
			<PanelHeader
				title="System prompt"
				description="The persona the terminal speaks with. Every save is a new version and takes effect on the next message, with no deploy. Operating rules (formatting, retrieval, honesty) are added in code."
			/>
			<div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_17rem]">
				<div className="grid gap-4">
					<Field label={active ? `Active: version ${active.number}` : "No version saved yet"} htmlFor="prompt-body">
						<textarea
							id="prompt-body"
							value={content}
							onChange={(e) => setContent(e.target.value)}
							rows={22}
							className={`${inputClass} resize-y font-mono text-[13px] leading-relaxed`}
						/>
					</Field>
					<Field label="Note for this version" htmlFor="prompt-note" hint="Optional. What changed and why.">
						<input id="prompt-note" value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
					</Field>
					{error && <p className="text-[13px] text-danger">{error}</p>}
					<div className="flex gap-2">
						<Button
							tone="primary"
							disabled={busy || !dirty || !content.trim()}
							onClick={() => void run(() => save({ content, note: note || undefined }))}
						>
							{busy ? "Saving…" : "Save new version"}
						</Button>
						{dirty && (
							<Button tone="ghost" onClick={() => setContent(active?.content ?? "")}>
								Discard changes
							</Button>
						)}
					</div>
				</div>

				<aside aria-label="Version history">
					<h2 className="text-[12px] text-fog">History</h2>
					<ol className="mt-3 divide-y divide-line border-y border-line">
						{versions.map((v) => (
							<li key={v._id} className="py-3">
								<button
									type="button"
									onClick={() => setViewing(viewing === v._id ? null : v._id)}
									className="w-full text-left"
								>
									<span className={`text-[13px] ${v.active ? "text-cyan" : "text-ice"}`}>
										v{v.number}
										{v.active && " / active"}
									</span>
									<span className="mt-0.5 block text-[12px] text-dim">{formatTime(v._creationTime)}</span>
									{v.note && <span className="mt-1 block text-[12px] text-fog">{v.note}</span>}
								</button>
								{viewing === v._id && !v.active && (
									<Button className="mt-2" disabled={busy} onClick={() => void run(() => restore({ versionId: v._id }))}>
										Restore v{v.number}
									</Button>
								)}
							</li>
						))}
					</ol>
				</aside>
			</div>
			{viewed && !viewed.active && (
				<section className="mt-8 border border-line bg-deep/60 p-5">
					<h2 className="text-[12px] text-fog">Version {viewed.number}</h2>
					<pre className="mt-3 max-h-[24rem] overflow-y-auto whitespace-pre-wrap text-[13px] leading-relaxed text-ice">
						{viewed.content}
					</pre>
				</section>
			)}
		</div>
	);
}
