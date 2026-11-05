import { v, type Infer } from "convex/values";

/** Knowledge-base namespaces. Kept free of SDK imports: schema.ts uses it. */
export const NAMESPACES = [
	"projects",
	"history",
	"skills",
	"goals",
	"blog",
	"github",
] as const;

export const vNamespace = v.union(
	v.literal("projects"),
	v.literal("history"),
	v.literal("skills"),
	v.literal("goals"),
	v.literal("blog"),
	v.literal("github"),
);
export type Namespace = Infer<typeof vNamespace>;
