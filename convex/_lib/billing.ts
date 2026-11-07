import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { env, type MutationCtx, type QueryCtx } from "../_generated/server";
import type { Tier } from "./persona";

/**
 * The AI budget. Every chat-model and judge call records its cost (as
 * reported by the Convex AI Gateway) into `aiSpend`; embeddings are a fraction
 * of a cent and not counted.
 *
 * Admission reserves each turn's worst-case cost (TURN_RESERVE_USD) before
 * the turn is scheduled, so spent + reserved never passes the limit; the
 * reservation is released when the turn finishes.
 *
 * Override with AI_MONTHLY_BUDGET_USD / AI_DAILY_BUDGET_USD in Convex env.
 */
const DEFAULT_MONTHLY_BUDGET_USD = 18;
const DEFAULT_DAILY_BUDGET_USD = 3;

function envNumber(name: "AI_MONTHLY_BUDGET_USD" | "AI_DAILY_BUDGET_USD", fallback: number) {
	const value = Number(env[name]);
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

/** Rows per period: concurrent calls rarely write the same one. */
const SPEND_SHARDS = 8;

async function spentIn(ctx: QueryCtx, period: string) {
	const rows = await ctx.db
		.query("aiSpend")
		.withIndex("by_period_shard", (q) => q.eq("period", period))
		.collect();
	return rows.reduce((sum, r) => sum + r.costUsd, 0);
}

export async function spendStatus(ctx: QueryCtx, now = Date.now()) {
	const keys = periods(now);
	const limits = budgets();
	const [month, day] = await Promise.all([spentIn(ctx, keys.month), spentIn(ctx, keys.day)]);
	return { month, day, limits };
}

/**
 * Worst-case cost of one turn: up to 4 model steps at the tier's context and
 * output caps (chat/agent.ts), plus the two judge calls, rounded up.
 */
export const TURN_RESERVE_USD: Record<Tier, number> = { guest: 0.02, registered: 0.5 };
/** Longer than any action can run; a reply re-claims its hold when it starts. */
export const RESERVATION_TTL_MS = 15 * 60 * 1000;

async function heldNow(ctx: QueryCtx, now: number) {
	const rows = await ctx.db
		.query("aiReservations")
		.withIndex("by_createdAt", (q) => q.gt("createdAt", now - RESERVATION_TTL_MS))
		.collect();
	return rows.reduce((sum, r) => sum + r.amountUsd, 0);
}

/**
 * Throws BUDGET unless this month's and today's spend, plus everything held
 * for turns in flight, plus `extra`, stays within the limits.
 */
export async function assertBudget(ctx: QueryCtx, extra = 0, now = Date.now()) {
	const { month, day, limits } = await spendStatus(ctx, now);
	const held = (await heldNow(ctx, now)) + extra;
	if (month + held > limits.month) throw new ConvexError({ code: "BUDGET", scope: "month" });
	if (day + held > limits.day) throw new ConvexError({ code: "BUDGET", scope: "day" });
}

/** Hold a turn's worst-case cost, or throw BUDGET. Runs in sendMessage's transaction. */
export async function reserveTurn(ctx: MutationCtx, tier: Tier, now = Date.now()) {
	const amountUsd = TURN_RESERVE_USD[tier];
	await assertBudget(ctx, amountUsd, now);
	// Tidy a few expired holds left by crashed turns.
	const expired = await ctx.db
		.query("aiReservations")
		.withIndex("by_createdAt", (q) => q.lte("createdAt", now - RESERVATION_TTL_MS))
		.take(10);
	await Promise.all(expired.map((row) => ctx.db.delete("aiReservations", row._id)));
	return await ctx.db.insert("aiReservations", { amountUsd, createdAt: now });
}

/**
 * End a turn's hold. With `charge`, the held amount is recorded as spent
 * instead (used when a real charge could not be recorded, to stay safe).
 */
export async function releaseReservation(ctx: MutationCtx, reservationId: Id<"aiReservations">, charge: boolean) {
	const row = await ctx.db.get("aiReservations", reservationId);
	if (!row) return;
	if (charge) await recordSpend(ctx, row.amountUsd);
	await ctx.db.delete("aiReservations", reservationId);
}

export async function recordSpend(ctx: MutationCtx, costUsd: number, now = Date.now()) {
	if (!(costUsd > 0)) return;
	const keys = periods(now);
	const shard = Math.floor(Math.random() * SPEND_SHARDS);
	// The month's row and the day's row are separate documents.
	await Promise.all(
		[keys.month, keys.day].map(async (period) => {
			const row = await ctx.db
				.query("aiSpend")
				.withIndex("by_period_shard", (q) => q.eq("period", period).eq("shard", shard))
				.unique();
			if (row) {
				await ctx.db.patch("aiSpend", row._id, { costUsd: row.costUsd + costUsd, calls: row.calls + 1 });
			} else {
				await ctx.db.insert("aiSpend", { period, shard, costUsd, calls: 1 });
			}
		}),
	);
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
	return ((usage?.inputTokens ?? 0) * price.input + (usage?.outputTokens ?? 0) * price.output) / 1_000_000;
}
