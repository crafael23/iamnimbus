import { v, type Infer } from "convex/values";

/**
 * When a knowledge doc was last true: a date (ms) for finished work, or
 * "current" for work that is still going on. Kept free of SDK imports:
 * schema.ts uses it.
 */
export const vAsOf = v.union(v.number(), v.literal("current"));
export type AsOf = Infer<typeof vAsOf>;

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
/** A record this many years old counts half as recent as current work. */
const HALF_LIFE_YEARS = 3;
/** Undated docs (skills, goals) rank like a three-year-old record. */
const UNDATED = 0.5;
/** At most this share of a hit's score depends on its age. */
const RECENCY_SHARE = 0.2;

export function recency(asOf: AsOf | undefined, now: number) {
	if (asOf === undefined) return UNDATED;
	if (asOf === "current") return 1;
	const years = Math.max(0, now - asOf) / YEAR_MS;
	return 0.5 ** (years / HALF_LIFE_YEARS);
}

/**
 * Re-rank search hits so recent work wins close calls. Relevance still leads:
 * a clearly better match from years ago keeps its place over a vague current one.
 */
export function rankByRecency<T extends { score: number; asOf?: AsOf }>(
	hits: T[],
	now: number,
): T[] {
	const weighted = (h: T) => h.score * (1 - RECENCY_SHARE + RECENCY_SHARE * recency(h.asOf, now));
	return [...hits].sort((a, b) => weighted(b) - weighted(a));
}

/** "current", or "as of Mar 2024", for the agent's view of a hit. */
export function asOfLabel(asOf: AsOf | undefined): string | null {
	if (asOf === undefined) return null;
	if (asOf === "current") return "current";
	const when = new Date(asOf).toLocaleDateString("en-US", {
		month: "short",
		year: "numeric",
		timeZone: "UTC",
	});
	return `as of ${when}`;
}

/** A project's free-text year ("2023", "2022–present") as an as-of date. */
export function asOfFromYear(year: string | undefined): AsOf | undefined {
	if (!year) return undefined;
	if (/present|current|now|ongoing/i.test(year)) return "current";
	const years = year.match(/\b(19|20)\d{2}\b/g);
	if (!years) return undefined;
	return Date.UTC(Number(years[years.length - 1]), 6, 1);
}
