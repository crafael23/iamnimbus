import { internalMutation } from "../_generated/server";
import { refreshRepoDoc } from "../_lib/github";
import { removeDerivedDoc, upsertDerivedDoc } from "../_lib/knowledge";
import { PLACEHOLDER_PERSONA } from "../_lib/persona";

/**
 * Demo content, clearly labelled as SAMPLE. Every seeded slug starts with
 * "sample-" so `seed/internal:clear` can remove exactly what this created.
 *
 *   npx convex run seed/internal:run
 *   npx convex run seed/internal:clear
 */

const SAMPLE_PROJECT = {
	slug: "sample-portfolio-os",
	title: "SAMPLE: Portfolio OS",
	summary:
		"Sample project record. A conversational portfolio: a terminal you can talk to, backed by a curated knowledge base.",
	problem:
		"SAMPLE CONTENT. Replace it from /admin, Projects.\n\nStatic portfolios answer *what was built* but not *how the builder thinks*. Visitors skim a list and leave.",
	solution:
		"A terminal-first site where an AI proxy answers questions from a knowledge base of project write-ups, published posts and GitHub repositories. Blog and project pages stay readable on their own.",
	stack: ["Next.js", "Convex", "@convex-dev/agent", "@convex-dev/rag", "WorkOS AuthKit"],
	decisions:
		"- Retrieval is a tool the model calls only when a question needs it, so small talk stays fast.\n- Tier and model are decided on the server from auth state; the client never sends either.\n- Publishing a post and indexing it happen in one transaction.",
	outcome:
		"SAMPLE CONTENT. This record exists to demonstrate the project page layout and retrieval. Delete it with `npx convex run seed/internal:clear`.",
	year: "2026",
	order: 0,
};

const SAMPLE_POST = {
	slug: "sample-writing-is-infrastructure",
	title: "SAMPLE: Writing is infrastructure",
	excerpt:
		"Sample post. Why every published post here is also a memory for the terminal.",
	content: `> **SAMPLE POST.** Seeded to demonstrate the blog. Remove it with \`npx convex run seed/internal:clear\`.

On this site, publishing a post does two things in one transaction: the post becomes public, and it is queued for ingestion into the knowledge base the terminal reads from. Unpublishing reverses both.

## Why it matters

The terminal can only be as good as what has been written down. Treating writing as infrastructure means:

1. Every post is chunked and embedded as soon as it goes live.
2. The assistant decides per question whether to search it.
3. There is no separate sync step to forget.

\`\`\`ts
// publish = visible + indexed, atomically
await ctx.db.patch(postId, { status: "published" });
await upsertDerivedDoc(ctx, { namespace: "blog", ... });
\`\`\`

Drafts never leave the server: the public query returns \`null\` for them, exactly as it does for a slug that does not exist.`,
};

export const run = internalMutation({
	args: {},
	handler: async (ctx) => {
		const created: string[] = [];
		const prompt = await ctx.db.query("systemPromptVersions").first();
		if (!prompt) {
			await ctx.db.insert("systemPromptVersions", {
				content: PLACEHOLDER_PERSONA,
				note: "Seeded placeholder persona. Replace it with your own.",
			});
			created.push("system prompt v1 (placeholder)");
		}

		const project = await ctx.db
			.query("projects")
			.withIndex("by_slug", (q) => q.eq("slug", SAMPLE_PROJECT.slug))
			.unique();
		if (!project) {
			const id = await ctx.db.insert("projects", {
				...SAMPLE_PROJECT,
				updatedAt: Date.now(),
			});
			await upsertDerivedDoc(ctx, {
				namespace: "projects",
				source: "project",
				sourceKey: id,
				title: SAMPLE_PROJECT.title,
				content: `${SAMPLE_PROJECT.summary}\n\nStack: ${SAMPLE_PROJECT.stack.join(", ")}\nPortfolio page: /projects/${SAMPLE_PROJECT.slug}\n\n## Problem\n${SAMPLE_PROJECT.problem}\n\n## Solution\n${SAMPLE_PROJECT.solution}\n\n## Key decisions\n${SAMPLE_PROJECT.decisions}\n\n## Outcome\n${SAMPLE_PROJECT.outcome}`,
			});
			created.push(`project ${SAMPLE_PROJECT.slug}`);
		}

		const post = await ctx.db
			.query("blogPosts")
			.withIndex("by_slug", (q) => q.eq("slug", SAMPLE_POST.slug))
			.unique();
		if (!post) {
			const publishedAt = Date.now();
			const id = await ctx.db.insert("blogPosts", {
				...SAMPLE_POST,
				status: "published",
				publishedAt,
				updatedAt: publishedAt,
			});
			await upsertDerivedDoc(ctx, {
				namespace: "blog",
				source: "blog",
				sourceKey: id,
				title: SAMPLE_POST.title,
				asOf: publishedAt,
				content: `Blog post published at /blog/${SAMPLE_POST.slug}\n\n${SAMPLE_POST.excerpt}\n\n${SAMPLE_POST.content}`,
			});
			created.push(`post ${SAMPLE_POST.slug}`);
		}
		return { created };
	},
});

/** Removes the sample project and post (and their knowledge docs). Leaves prompts alone. */
export const clear = internalMutation({
	args: {},
	handler: async (ctx) => {
		const removed: string[] = [];
		for (const p of await ctx.db.query("projects").collect()) {
			if (p.slug.startsWith("sample-")) {
				await ctx.db.delete(p._id);
				await removeDerivedDoc(ctx, "project", p._id);
				if (p.githubRepo) await refreshRepoDoc(ctx, p.githubRepo);
				removed.push(p.slug);
			}
		}
		for (const p of await ctx.db.query("blogPosts").collect()) {
			if (p.slug.startsWith("sample-")) {
				await ctx.db.delete(p._id);
				await removeDerivedDoc(ctx, "blog", p._id);
				removed.push(p.slug);
			}
		}
		return { removed };
	},
});
