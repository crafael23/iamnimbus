import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { upsertDerivedDoc } from "./knowledge";

/** A repo as the sync action hands it to applySync (no sync bookkeeping). */
export const vSyncedRepo = v.object({
	fullName: v.string(),
	name: v.string(),
	url: v.string(),
	description: v.optional(v.string()),
	homepage: v.optional(v.string()),
	languages: v.array(v.object({ name: v.string(), percent: v.number() })),
	topics: v.array(v.string()),
	stars: v.number(),
	forks: v.number(),
	archived: v.boolean(),
	createdAt: v.number(),
	pushedAt: v.number(),
	readme: v.optional(v.string()),
});

type Repo = Doc<"githubRepos">;
type LinkedProject = Pick<Doc<"projects">, "title" | "slug">;

/**
 * A repo's identity: `owner/name` lowercased, because GitHub names are
 * case-insensitive. `githubRepos.fullName`, `projects.githubRepo` and the
 * repo's knowledge doc key all hold this form; display text comes from the
 * repo URL, which keeps GitHub's casing.
 */
export const repoKey = (fullName: string) => fullName.trim().toLowerCase();

export const repoUrlFor = (fullName: string) => `https://github.com/${fullName}`;

/** `Owner/Name` as GitHub spells it. */
export const repoLabel = (repo: Pick<Repo, "url" | "fullName">) =>
	repo.url.replace(/^https:\/\/github\.com\//, "") || repo.fullName;

export async function findRepo(ctx: QueryCtx, fullName: string) {
	return await ctx.db
		.query("githubRepos")
		.withIndex("by_fullName", (q) => q.eq("fullName", repoKey(fullName)))
		.unique();
}

export async function projectForRepo(ctx: QueryCtx, fullName: string) {
	return await ctx.db
		.query("projects")
		.withIndex("by_githubRepo", (q) => q.eq("githubRepo", repoKey(fullName)))
		.first();
}

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The repo's knowledge doc: GitHub facts, its README, and the project it belongs to. */
export function repoDocContent(repo: Repo, project: LinkedProject | null) {
	return [
		`GitHub repository ${repoLabel(repo)}`,
		repo.description ?? "No description.",
		project
			? `Portfolio project: ${project.title} ([/projects/${project.slug}](/projects/${project.slug})). This repository is the code behind it.`
			: null,
		`URL: ${repo.url}`,
		repo.homepage ? `Homepage: ${repo.homepage}` : null,
		`Languages: ${repo.languages.map((l) => `${l.name} ${l.percent}%`).join(", ") || "unknown"}`,
		repo.topics.length ? `Topics: ${repo.topics.join(", ")}` : null,
		`Stars: ${repo.stars}. Forks: ${repo.forks}.`,
		`Created ${day(repo.createdAt)}, last pushed ${day(repo.pushedAt)}.`,
		repo.archived ? "Archived." : null,
		repo.readme ? `## README\n${repo.readme}` : "No README.",
	]
		.filter(Boolean)
		.join("\n");
}

/**
 * Rewrite one repo's knowledge doc from its row and its linked project. Call
 * after anything that changes either; unchanged content is not re-embedded.
 */
export async function refreshRepoDoc(ctx: MutationCtx, fullName: string) {
	const repo = await findRepo(ctx, fullName);
	if (!repo) return;
	const project = await projectForRepo(ctx, fullName);
	await upsertDerivedDoc(ctx, {
		namespace: "github",
		source: "github",
		sourceKey: repo.fullName,
		title: `${repo.name} (GitHub)`,
		content: repoDocContent(repo, project),
	});
}
