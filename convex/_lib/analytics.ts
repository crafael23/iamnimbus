import { v } from "convex/values";
import type { MutationCtx } from "../_generated/server";
export const topics = [
	"projects",
	"experience",
	"skills",
	"writing",
	"availability/contact",
	"about/personal",
	"general tech",
	"other",
] as const;
export const vTopic = v.union(...topics.map((topic) => v.literal(topic)));
export const vTier = v.union(v.literal("guest"), v.literal("registered"));
export const vKind = v.union(
	v.literal("session"),
	v.literal("message"),
	v.literal("limit"),
	v.literal("conversion"),
	v.literal("topic"),
);
export const eventFields = {
	day: v.string(),
	kind: vKind,
	tier: v.optional(vTier),
	topic: v.optional(vTopic),
	atGate: v.optional(v.boolean()),
};
export const utcDay = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
export async function recordEvent(
	ctx: MutationCtx,
	event: Omit<import("../_generated/dataModel").Doc<"analyticsEvents">, "_id" | "_creationTime" | "day">,
) {
	await ctx.db.insert("analyticsEvents", { day: utcDay(), ...event });
}
