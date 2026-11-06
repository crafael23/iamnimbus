import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import { asUser, setup, type T } from "./setup";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const repo = (name: string) => ({
	fullName: `owner/${name}`,
	name,
	url: `https://github.com/owner/${name}`,
	description: `The ${name} repo`,
	languages: [
		{ name: "TypeScript", percent: 80 },
		{ name: "CSS", percent: 20 },
	],
	topics: ["convex"],
	stars: 3,
	forks: 0,
	archived: false,
	createdAt: Date.parse("2025-01-01"),
	pushedAt: Date.parse("2026-10-01"),
	readme: `# ${name}\nSecret README text.`,
});

const project = (slug: string, githubRepo?: string) => ({
	slug,
	title: `Project ${slug}`,
	summary: "s",
	problem: "p",
	solution: "s",
	stack: ["TS"],
	decisions: "d",
	outcome: "o",
	order: 1,
	githubRepo,
});

async function synced(t: T, names = ["alpha", "beta"]) {
	await t.mutation(internal.github.mutations.applySync, {
		username: "owner",
		repos: names.map(repo),
	});
	return await asUser(t, "user_admin", "admin");
}

const docFor = (t: T, source: "github" | "project", sourceKey: string) =>
	t.run((ctx) =>
		ctx.db
			.query("knowledgeDocs")
			.withIndex("by_source", (q) => q.eq("source", source).eq("sourceKey", sourceKey))
			.unique(),
	);

describe("projects linked to GitHub repos", () => {
	test("a project links to a synced repo, and each side names the other", async () => {
		const t = setup();
		const admin = await synced(t);
		const id = await admin.mutation(api.projects.mutations.save, project("site", "owner/alpha"));

		expect((await docFor(t, "project", id))?.content).toContain(
			"Repository: https://github.com/owner/alpha (GitHub owner/alpha)",
		);
		expect((await docFor(t, "github", "owner/alpha"))?.content).toContain(
			"Portfolio project: Project site ([/projects/site](/projects/site))",
		);
		expect((await docFor(t, "github", "owner/beta"))?.content).not.toContain("Portfolio project");

		const page = await t.query(api.projects.queries.getBySlug, { slug: "site" });
		expect(page?.repo).toMatchObject({ fullName: "owner/alpha", stars: 3 });
		expect(page?.repo).not.toHaveProperty("readme");
	});

	test("a repo belongs to at most one project", async () => {
		const t = setup();
		const admin = await synced(t);
		const first = await admin.mutation(api.projects.mutations.save, project("one", "owner/alpha"));
		await expect(
			admin.mutation(api.projects.mutations.save, project("two", "owner/alpha")),
		).rejects.toThrow(/already linked to “Project one”/);
		// Re-saving the owner keeps its own link.
		await admin.mutation(api.projects.mutations.save, { projectId: first, ...project("one", "owner/alpha") });
		await expect(
			admin.mutation(api.projects.mutations.save, project("two", "owner/beta")),
		).resolves.toBeTruthy();
	});

	test("only repos in the last sync can be linked", async () => {
		const t = setup();
		const admin = await synced(t);
		await expect(
			admin.mutation(api.projects.mutations.save, project("x", "owner/missing")),
		).rejects.toThrow(/not in the last GitHub sync/);
	});

	test("a linked repo replaces a typed repository URL", async () => {
		const t = setup();
		const admin = await synced(t);
		const id = await admin.mutation(api.projects.mutations.save, {
			...project("site", "owner/alpha"),
			repoUrl: "https://example.com/other",
		});
		const saved = await t.run((ctx) => ctx.db.get(id));
		expect(saved?.repoUrl).toBeUndefined();
	});

	test("moving the link or deleting the project updates the repos' docs", async () => {
		const t = setup();
		const admin = await synced(t);
		const id = await admin.mutation(api.projects.mutations.save, project("site", "owner/alpha"));
		await admin.mutation(api.projects.mutations.save, { projectId: id, ...project("site", "owner/beta") });
		expect((await docFor(t, "github", "owner/alpha"))?.content).not.toContain("Portfolio project");
		expect((await docFor(t, "github", "owner/beta"))?.content).toContain("Portfolio project: Project site");

		// The freed repo can now go to another project.
		await admin.mutation(api.projects.mutations.save, project("other", "owner/alpha"));

		await admin.mutation(api.projects.mutations.remove, { projectId: id });
		expect((await docFor(t, "github", "owner/beta"))?.content).not.toContain("Portfolio project");
	});

	test("a repo dropped by the next sync leaves the link but no details", async () => {
		const t = setup();
		const admin = await synced(t);
		await admin.mutation(api.projects.mutations.save, project("site", "owner/alpha"));
		await t.mutation(internal.github.mutations.applySync, { username: "owner", repos: [repo("beta")] });

		expect(await docFor(t, "github", "owner/alpha")).toBeNull();
		const page = await t.query(api.projects.queries.getBySlug, { slug: "site" });
		expect(page?.githubRepo).toBe("owner/alpha");
		expect(page?.repo).toBeNull();

		// When it comes back, the doc names the project again.
		await t.mutation(internal.github.mutations.applySync, {
			username: "owner",
			repos: [repo("alpha"), repo("beta")],
		});
		expect((await docFor(t, "github", "owner/alpha"))?.content).toContain("Portfolio project: Project site");
	});

	test("repo identity ignores case, so a case-only rename cannot free the repo", async () => {
		const t = setup();
		const admin = await synced(t, ["Alpha"]);
		await admin.mutation(api.projects.mutations.save, project("one", "owner/Alpha"));
		// GitHub now reports the same repo in lower case.
		await t.mutation(internal.github.mutations.applySync, { username: "owner", repos: [repo("alpha")] });

		for (const spelling of ["owner/alpha", "OWNER/ALPHA"]) {
			await expect(
				admin.mutation(api.projects.mutations.save, project(`two-${spelling.length}`, spelling)),
			).rejects.toThrow(/already linked to “Project one”/);
		}
		const page = await t.query(api.projects.queries.getBySlug, { slug: "one" });
		expect(page?.repo?.fullName).toBe("owner/alpha");
		const docs = await t.run((ctx) =>
			ctx.db
				.query("knowledgeDocs")
				.withIndex("by_source", (q) => q.eq("source", "github"))
				.collect(),
		);
		expect(docs.map((d) => d.sourceKey)).toEqual(["owner/alpha"]);
		expect(docs[0]?.content).toContain("Portfolio project: Project one");
	});

	test("the picker lists synced repos with the project each belongs to", async () => {
		const t = setup();
		const admin = await synced(t);
		const id = await admin.mutation(api.projects.mutations.save, project("site", "owner/alpha"));
		const options = await admin.query(api.github.queries.repos, {});
		expect(options.find((o) => o.fullName === "owner/alpha")?.linkedProject?._id).toBe(id);
		expect(options.find((o) => o.fullName === "owner/beta")?.linkedProject).toBeNull();
	});
});
