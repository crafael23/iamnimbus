"use client";
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button, PanelHeader } from "./ui";
import { SkeletonRows } from "./KnowledgePanel";
export function AnalyticsPanel() {
	const [days, setDays] = useState<7 | 30>(7);
	const data = useQuery(api.analytics.queries.summary, { days });
	const percent = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)}%` : "—");
	const max = Math.max(1, ...(data?.topics.map((t) => t.count) ?? []));
	return (
		<div>
			<PanelHeader
				title="Analytics"
				description="Anonymous counts, UTC calendar days including today. No analytics cookies or visitor identifiers."
				action={
					<div className="flex gap-2">
						{([7, 30] as const).map((n) => (
							<Button
								key={n}
								aria-pressed={days === n}
								tone={days === n ? "primary" : "default"}
								onClick={() => setDays(n)}
							>
								{n}d
							</Button>
						))}
					</div>
				}
			/>
			{!data ? (
				<SkeletonRows />
			) : (
				<>
					<dl className="grid gap-6 text-[13px] sm:grid-cols-2">
						{[
							["Guest sessions", data.sessions.guest],
							["Registered sessions", data.sessions.registered],
							["Guest messages", data.messages.guest],
							["Registered messages", data.messages.registered],
							["Guest allowances exhausted", data.reachedLimit],
							["Conversions", data.conversions],
							["Conversions / guest sessions", percent(data.conversions, data.sessions.guest)],
							["Conversions from limit gate", `${data.atGate} (${percent(data.atGate, data.conversions)})`],
							["AI spend this month / budget", `$${data.monthSpend.toFixed(2)} / $${data.monthBudget.toFixed(2)}`],
						].map(([label, value]) => (
							<div key={label}>
								<dt className="text-dim">{label}</dt>
								<dd className="mt-1 text-ice">{value}</dd>
							</div>
						))}
					</dl>
					<p className="mt-6 text-[12px] text-dim">
						Limit counts measure successful messages that exhaust the guest allowance. Network refusals are not counted.
						Conversion rates compare events in this window, not a signup cohort.
					</p>
					<h2 className="mt-8 text-sm text-ice">Most asked topics</h2>
					<div className="mt-4 space-y-3">
						{data.topics.map((t) => (
							<div key={t.topic} className="text-[13px]">
								<div className="flex justify-between text-fog">
									<span>{t.topic}</span>
									<span>{t.count}</span>
								</div>
								<div className="mt-1 h-2 bg-deep">
									<div className="h-2 bg-cyan" style={{ width: `${(100 * t.count) / max}%` }} />
								</div>
							</div>
						))}
					</div>
				</>
			)}
		</div>
	);
}
