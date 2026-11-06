import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/**
 * The AI budget. Every chat-model and judge call records its cost (as
 * reported by the Convex AI Gateway) into `aiSpend`; embeddings are a fraction
 * of a cent and not counted. sendMessage refuses
 * new messages once the month or the day is spent. Spend can overshoot only
 * by replies already in flight when the line is crossed (cents).
 *
 * Override with AI_MONTHLY_BUDGET_USD / AI_DAILY_BUDGET_USD in Convex env.
 */
const DEFAULT_MONTHLY_BUDGET_USD = 18;
const DEFAULT_DAILY_BUDGET_USD = 3;

function envNumber(name: string, fallback: number) {
	const value = Number(process.env[name]);
	return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function budgets() {
	return {
		month: envNumber("AI_MONTHLY_BUDGET_USD", DEFAULT_MONTHLY_BUDGET_USD),
		day: envNumber("AI_DAILY_BUDGET_USD", DEFAULT_DAILY_BUDGET_USD),
	};
}

/** UTC period keys for a timestamp: "2026-11" and "2026-11-05". */
export function periods(now: number) {
	const iso = new Date(now).toISOString();
	return { month: iso.slice(0, 7), day: iso.slice(0, 10) };
}

async function spentIn(ctx: QueryCtx, period: string) {
	const row = await ctx.db
		.query("aiSpend")
		.withIndex("by_period", (q) => q.eq("period", period))
		.unique();
	return row?.costUsd ?? 0;
}

export async function spendStatus(ctx: QueryCtx, now = Date.now()) {
	const keys = periods(now);
	const limits = budgets();
	const [month, day] = await Promise.all([spentIn(ctx, keys.month), spentIn(ctx, keys.day)]);
	return { month, day, limits };
}

/** Throws BUDGET when this month's or today's spend has reached its limit. */
export async function assertBudget(ctx: QueryCtx) {
	const { month, day, limits } = await spendStatus(ctx);
	if (month >= limits.month) throw new ConvexError({ code: "BUDGET", scope: "month" });
	if (day >= limits.day) throw new ConvexError({ code: "BUDGET", scope: "day" });
}

export async function recordSpend(ctx: MutationCtx, costUsd: number, now = Date.now()) {
	if (!(costUsd > 0)) return;
	const keys = periods(now);
	for (const period of [keys.month, keys.day]) {
		const row = await ctx.db
			.query("aiSpend")
			.withIndex("by_period", (q) => q.eq("period", period))
			.unique();
		if (row) {
			await ctx.db.patch(row._id, { costUsd: row.costUsd + costUsd, calls: row.calls + 1 });
		} else {
			await ctx.db.insert("aiSpend", { period, costUsd, calls: 1 });
		}
	}
}

/** List prices per million tokens, used only when the gateway reports no cost. */
const FALLBACK_PRICES: Record<string, { input: number; output: number }> = {
	"anthropic/claude-haiku-5.5": { input: 0.1, output: 0.5 },
	"anthropic/claude-sonnet-5.5": { input: 2, output: 10 },
};
const UNKNOWN_MODEL_PRICE = { input: 5, output: 25 };

/**
 * The dollar cost of one model call: the gateway's reported cost when present,
 * otherwise an estimate from token counts at list price (erring high).
 */
export function costOf(
	model: string,
	usage: { inputTokens?: number; outputTokens?: number; raw?: unknown } | undefined,
	providerMetadata: Record<string, Record<string, unknown>> | undefined,
) {
	const reported = providerMetadata?.convexGateway?.cost;
	if (typeof reported === "number") return reported;
	const raw = usage?.raw as { cost?: unknown } | undefined;
	if (typeof raw?.cost === "number") return raw.cost;
	const price = FALLBACK_PRICES[model] ?? UNKNOWN_MODEL_PRICE;
	return (
		((usage?.inputTokens ?? 0) * price.input + (usage?.outputTokens ?? 0) * price.output) / 1_000_000
	);
}
