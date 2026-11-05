import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import { asUser, scheduled, setup, type T } from "./setup";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function adminWithPost(t: T) {
	const admin = await asUser(t, "user_admin", "admin");
	const postId = await admin.mutation(api.blog.mutations.create, {
		slug: "on-auth",
		title: "On authentication",
		excerpt: "Notes.",
		content: "Body about auth.",
	});
	return { admin, postId };
}

const blogDocs = (t: T) =>
	t.run((ctx) =>
		ctx.db
			.query("knowledgeDocs")
			.withIndex("by_source", (q) => q.eq("source", "blog"))
			.collect(),
	);

describe("blog publishing and the knowledge base", () => {
	test("drafts are not public and not indexed", async () => {
		const t = setup();
		await adminWithPost(t);
		expect(await t.query(api.blog.queries.getPublishedBySlug, { slug: "on-auth" })).toBeNull();
		expect(await t.query(api.blog.queries.listPublished, {})).toHaveLength(0);
		expect(await blogDocs(t)).toHaveLength(0);
	});

	test("publish makes the post public and schedules ingestion in the same transaction", async () => {
		const t = setup();
		const { admin, postId } = await adminWithPost(t);
		await admin.mutation(api.blog.mutations.publish, { postId });

		const post = await t.query(api.blog.queries.getPublishedBySlug, { slug: "on-auth" });
		expect(post?.title).toBe("On authentication");
		const docs = await blogDocs(t);
		expect(docs).toHaveLength(1);
		expect(docs[0]).toMatchObject({ namespace: "blog", sourceKey: postId, status: "pending", version: 1 });
		expect(docs[0]?.content).toContain("Body about auth.");
		const jobs = await scheduled(t);
		expect(jobs.some((j) => j.name.includes("knowledge/actions") && j.name.includes("ingest"))).toBe(true);
	});

	test("editing a published post re-ingests it; unpublish removes post and vectors together", async () => {
		const t = setup();
		const { admin, postId } = await adminWithPost(t);
		await admin.mutation(api.blog.mutations.publish, { postId });
		await admin.mutation(api.blog.mutations.update, {
			postId,
			slug: "on-auth",
			title: "On authentication",
			excerpt: "Notes.",
			content: "Revised body.",
		});
		let docs = await blogDocs(t);
		expect(docs[0]).toMatchObject({ version: 2, status: "pending" });
		expect(docs[0]?.content).toContain("Revised body.");

		await admin.mutation(api.blog.mutations.unpublish, { postId });
		expect(await t.query(api.blog.queries.getPublishedBySlug, { slug: "on-auth" })).toBeNull();
		docs = await blogDocs(t);
		expect(docs).toHaveLength(0);
		const removal = (await scheduled(t)).find((j) => j.name.includes("removeFromIndex"));
		expect(removal?.args[0]).toMatchObject({ namespace: "blog", key: expect.any(String) });
	});

	test("saving a project mirrors it into the projects namespace", async () => {
		const t = setup();
		const admin = await asUser(t, "user_admin", "admin");
		const projectId = await admin.mutation(api.projects.mutations.save, {
			slug: "grid",
			title: "Grid",
			summary: "A terminal.",
			problem: "P",
			solution: "S",
			stack: [" Convex ", "", "Next.js"],
			decisions: "D",
			outcome: "O",
			order: 0,
		});
		const doc = await t.run((ctx) =>
			ctx.db
				.query("knowledgeDocs")
				.withIndex("by_source", (q) => q.eq("source", "project").eq("sourceKey", projectId))
				.unique(),
		);
		expect(doc).toMatchObject({ namespace: "projects", status: "pending" });
		expect(doc?.content).toContain("Stack: Convex, Next.js");
		await admin.mutation(api.projects.mutations.remove, { projectId });
		expect(await t.query(api.projects.queries.getBySlug, { slug: "grid" })).toBeNull();
	});
});

describe("ingestion bookkeeping", () => {
	test("a finished ingest of an outdated version re-schedules the newest", async () => {
		const t = setup();
		const admin = await asUser(t, "user_admin", "admin");
		const docId = await admin.mutation(api.knowledge.mutations.create, {
			namespace: "skills",
			title: "Skills",
			content: "v1",
		});
		await admin.mutation(api.knowledge.mutations.update, { docId, title: "Skills", content: "v2" });
		await t.mutation(internal.knowledge.mutations.markIngested, {
			docId,
			version: 1,
			namespace: "skills",
			chunkCount: 1,
		});
		const doc = await t.run((ctx) => ctx.db.get(docId));
		expect(doc?.status).toBe("pending");
		const ingests = (await scheduled(t)).filter((j) => j.name.includes("ingest"));
		expect(ingests.at(-1)?.args[0]).toMatchObject({ docId, version: 2 });

		await t.mutation(internal.knowledge.mutations.markIngested, {
			docId,
			version: 2,
			namespace: "skills",
			chunkCount: 3,
		});
		expect(await t.run((ctx) => ctx.db.get(docId))).toMatchObject({ status: "ready", chunkCount: 3 });
	});

	test("an ingest that finishes after deletion removes its vectors", async () => {
		const t = setup();
		const admin = await asUser(t, "user_admin", "admin");
		const docId = await admin.mutation(api.knowledge.mutations.create, {
			namespace: "goals",
			title: "Goals",
			content: "x",
		});
		await admin.mutation(api.knowledge.mutations.remove, { docId });
		await t.mutation(internal.knowledge.mutations.markIngested, {
			docId,
			version: 1,
			namespace: "goals",
			chunkCount: 1,
		});
		const removals = (await scheduled(t)).filter((j) => j.name.includes("removeFromIndex"));
		expect(removals.length).toBeGreaterThanOrEqual(2);
		expect(removals.at(-1)?.args[0]).toMatchObject({ namespace: "goals", key: docId });
	});

	test("derived docs cannot be edited or deleted directly", async () => {
		const t = setup();
		const { admin, postId } = await adminWithPost(t);
		await admin.mutation(api.blog.mutations.publish, { postId });
		const [doc] = await blogDocs(t);
		await expect(
			admin.mutation(api.knowledge.mutations.update, { docId: doc!._id, title: "x", content: "y" }),
		).rejects.toThrow(/blog source/);
		await expect(admin.mutation(api.knowledge.mutations.remove, { docId: doc!._id })).rejects.toThrow(/blog source/);
	});
});

describe("system prompt versions", () => {
	test("saves append versions; restore copies an old one forward as active", async () => {
		const t = setup();
		const admin = await asUser(t, "user_admin", "admin");
		const v1 = await admin.mutation(api.prompts.mutations.save, { content: "first" });
		await admin.mutation(api.prompts.mutations.save, { content: "second" });
		expect(await t.query(internal.prompts.queries.activeContent, {})).toBe("second");
		await admin.mutation(api.prompts.mutations.restore, { versionId: v1 });
		expect(await t.query(internal.prompts.queries.activeContent, {})).toBe("first");
		const versions = await admin.query(api.prompts.queries.listVersions, {});
		expect(versions.map((v) => [v.number, v.content, v.active])).toEqual([
			[3, "first", true],
			[2, "second", false],
			[1, "first", false],
		]);
	});

	test("with no versions the agent falls back to the placeholder persona", async () => {
		const t = setup();
		expect(await t.query(internal.prompts.queries.activeContent, {})).toMatch(/PLACEHOLDER PERSONA/);
	});
});
