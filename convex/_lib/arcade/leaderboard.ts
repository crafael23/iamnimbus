import { TableAggregate } from "@convex-dev/aggregate";
import { components } from "../../_generated/api";
import type { DataModel } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";

export const arcadeScores = new TableAggregate<{
	Key: number;
	DataModel: DataModel;
	TableName: "arcadeScores";
}>(components.arcadeScores, { sortKey: (d) => d.score });

const HOUR = 60 * 60 * 1000;
/** An unsubmitted run expires (and can no longer be submitted) this long after it starts. */
export const OPEN_RUN_TTL_MS = 2 * HOUR;
/** A run stuck in verification (a failed action) is dropped this long after submission. */
export const VERIFYING_TTL_MS = HOUR;
/** Finished runs are kept this long for their result screen. */
export const FINISHED_RUN_TTL_MS = 24 * HOUR;

/** Equal scores share a rank, regardless of the aggregate's document-id tie breaker. */
export async function rankOf(ctx: QueryCtx | MutationCtx, score: number): Promise<number> {
	return 1 + (await arcadeScores.count(ctx, { bounds: { lower: { key: score, inclusive: false } } }));
}
