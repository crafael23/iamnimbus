"use client";

import { useAction, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { SkeletonRows } from "./KnowledgePanel";
import { Button, PanelHeader, StatusBadge } from "./ui";
import { errorMessage, formatTime } from "./utils";

type SyncInfo = FunctionReturnType<typeof api.github.queries.lastRun>;

export function GithubPanel() {
	const info = useQuery(api.github.queries.lastRun);
	const sync = useAction(api.github.actions.sync);
	const [busy, setBusy] = useState(false);
	const [result, setResult] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const run = async () => {
		setBusy(true);
		setError(null);
		setResult(null);
		try {
			setResult(syncSummary(await sync({})));
		} catch (e) {
			setError(errorMessage(e));
		}
		setBusy(false);
	};

	return (
		<div>
			<PanelHeader
				title="GitHub"
				description="Pulls your public, non-fork repositories, plus public repositories in your organizations that you have committed to (description, languages, stars, recency and README). Private repositories are never synced. Unchanged repositories are not re-embedded."
				action={
					<Button tone="primary" onClick={() => void run()} disabled={busy || !info?.username}>
						{busy ? "Syncing…" : "Sync now"}
					</Button>
				}
			/>
			{info === undefined ? <SkeletonRows /> : <SyncSettings info={info} />}
			{result && <p className="mt-6 text-[13px] text-cyan">{result}</p>}
			{error && <p className="mt-6 text-[13px] text-danger">{error}</p>}
			<h2 className="mt-10 text-[12px] text-fog">Indexed repositories</h2>
			<IndexedRepos />
		</div>
	);
}

function SyncSettings({ info }: { info: SyncInfo }) {
	return (
		<dl className="grid gap-6 text-[13px] sm:grid-cols-4">
			<div>
				<dt className="text-dim">account</dt>
				<dd className="mt-1 text-ice">{info.username ?? "GITHUB_USERNAME not set"}</dd>
			</div>
			<div>
				<dt className="text-dim">organizations</dt>
				<dd className="mt-1 text-ice">
					{info.orgs.length ? info.orgs.join(", ") : "public memberships only (set GITHUB_ORGS)"}
				</dd>
			</div>
			<div>
				<dt className="text-dim">token</dt>
				<dd className="mt-1 text-ice">{info.hasToken ? "GITHUB_TOKEN set" : "none (60 requests/hour)"}</dd>
			</div>
			<LastSync run={info.run} />
		</dl>
	);
}

function lastSyncText(run: SyncInfo["run"]) {
	if (!run) return "never";
	return `${formatTime(run.finishedAt)}, ${run.status === "ok" ? `${run.repoCount} repositories` : "failed"}`;
}

function LastSync({ run }: { run: SyncInfo["run"] }) {
	return (
		<div>
			<dt className="text-dim">last sync</dt>
			<dd className={`mt-1 ${run?.status === "error" ? "text-danger" : "text-ice"}`}>{lastSyncText(run)}</dd>
			{run?.error && <dd className="mt-1 text-[12px] text-danger">{run.error}</dd>}
		</div>
	);
}

function IndexedRepos() {
	const docs = useQuery(api.knowledge.queries.list, { namespace: "github" });
	if (docs === undefined) return null;
	if (docs.length === 0) return <p className="mt-3 text-[13px] text-dim">None yet.</p>;
	return (
		<ul className="mt-3 divide-y divide-line border-y border-line">
			{docs.map((d) => (
				<li key={d._id} className="flex items-center justify-between gap-4 py-2.5">
					<span className="truncate text-[13px] text-ice">{d.title.replace(/ \(GitHub\)$/, "")}</span>
					<StatusBadge status={d.status} chunks={d.chunkCount} error={d.error} />
				</li>
			))}
		</ul>
	);
}

function syncSummary(r: { synced: number; removed: number; orgs: string[] }) {
	const removed = r.removed ? `, removed ${r.removed}` : "";
	const orgs = r.orgs.length ? ` (organizations scanned: ${r.orgs.join(", ")})` : "";
	return `Synced ${r.synced} repositories${removed}${orgs}.`;
}
