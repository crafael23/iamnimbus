import { ConvexError, v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { adminMutation } from "../_lib/customFunctions";
import { findRepo, projectForRepo, refreshRepoDoc, repoUrlFor } from "../_lib/github";
import { removeDerivedDoc, upsertDerivedDoc } from "../_lib/knowledge";
import { assertSlug } from "../_lib/slug";

const vProjectFields = {
	slug: v.string(),
	title: v.string(),
	summary: v.string(),
	problem: v.string(),
	solution: v.string(),
	stack: v.array(v.string()),
	decisions: v.string(),
	outcome: v.string(),
	year: v.optional(v.string()),
	githubRepo: v.optional(v.string()),
	repoUrl: v.optional(v.string()),
	liveUrl: v.optional(v.string()),
	order: v.number(),
};

type ProjectFields = Omit<Doc<"projects">, "_id" | "_creationTime" | "updatedAt">;

function knowledgeContent(p: ProjectFields) {
	const links = [
		`Portfolio page: /projects/${p.slug}`,
		p.githubRepo
			? `Repository: ${repoUrlFor(p.githubRepo)} (GitHub ${p.githubRepo})`
			: p.repoUrl && `Repository: ${p.repoUrl}`,
		p.liveUrl && `Live: ${p.liveUrl}`,
	]
		.filter(Boolean)
		.join("\n");
	return [
		p.summary,
		p.year && `Year: ${p.year}`,
		`Stack: ${p.stack.join(", ")}`,
		links,
		`## Problem\n${p.problem}`,
		`## Solution\n${p.solution}`,
		`## Key decisions\n${p.decisions}`,
		`## Outcome\n${p.outcome}`,
	]
		.filter(Boolean)
		.join("\n\n");
}

async function validate(
	ctx: MutationCtx,
	fields: ProjectFields,
	projectId?: Doc<"projects">["_id"],
) {
	if (!fields.title.trim()) throw new ConvexError("Title is required");
	assertSlug(fields.slug);
	for (const url of [fields.repoUrl, fields.liveUrl]) {
		if (url && !url.startsWith("https://")) {
			throw new ConvexError("Links must start with https://");
		}
	}
	const clash = await ctx.db
		.query("projects")
		.withIndex("by_slug", (q) => q.eq("slug", fields.slug))
		.first();
	if (clash && clash._id !== projectId) {
		throw new ConvexError("Another project already uses this slug");
	}
	// One repo, one project. Mutations are serializable, so two saves racing
	// for the same repo cannot both pass this check.
	if (fields.githubRepo) {
		if (!(await findRepo(ctx, fields.githubRepo))) {
			throw new ConvexError("That repository is not in the last GitHub sync");
		}
		const owner = await projectForRepo(ctx, fields.githubRepo);
		if (owner && owner._id !== projectId) {
			throw new ConvexError(`That repository is already linked to “${owner.title}”`);
		}
	}
}

/** Create or update a project; its `projects` knowledge doc follows in the same transaction. */
export const save = adminMutation({
	args: { projectId: v.optional(v.id("projects")), ...vProjectFields },
	handler: async (ctx, { projectId, ...fields }) => {
		const stack = fields.stack.map((s) => s.trim()).filter(Boolean);
		// A linked repo supplies the repository link; a typed URL is only for others.
		const clean = {
			...fields,
			stack,
			githubRepo: fields.githubRepo || undefined,
			repoUrl: fields.githubRepo ? undefined : fields.repoUrl,
		};
		await validate(ctx, clean, projectId);
		let id = projectId;
		let previousRepo: string | undefined;
		if (id) {
			const existing = await ctx.db.get(id);
			if (!existing) throw new ConvexError("Project not found");
			previousRepo = existing.githubRepo;
			await ctx.db.patch(id, { ...clean, updatedAt: Date.now() });
		} else {
			id = await ctx.db.insert("projects", { ...clean, updatedAt: Date.now() });
		}
		await upsertDerivedDoc(ctx, {
			namespace: "projects",
			source: "project",
			sourceKey: id,
			title: clean.title,
			content: knowledgeContent(clean),
		});
		// Both repos' docs name (or stop naming) this project.
		if (previousRepo && previousRepo !== clean.githubRepo) {
			await refreshRepoDoc(ctx, previousRepo);
		}
		if (clean.githubRepo) await refreshRepoDoc(ctx, clean.githubRepo);
		return id;
	},
});

export const remove = adminMutation({
	args: { projectId: v.id("projects") },
	handler: async (ctx, { projectId }) => {
		const project = await ctx.db.get(projectId);
		if (!project) return;
		await ctx.db.delete(projectId);
		await removeDerivedDoc(ctx, "project", projectId);
		if (project.githubRepo) await refreshRepoDoc(ctx, project.githubRepo);
	},
});
