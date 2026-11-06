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

	test("a link saved before keys were normalized is migrated by the next sync", async () => {
		const t = setup();
		const admin = await asUser(t, "user_admin", "admin");
		await t.run(async (ctx) => {
			await ctx.db.insert("projects", {
				...project("old"),
				githubRepo: "owner/Alpha",
				updatedAt: Date.now(),
			});
		});
		await t.mutation(internal.github.mutations.applySync, { username: "owner", repos: [repo("alpha")] });

		await expect(
			admin.mutation(api.projects.mutations.save, project("new", "owner/alpha")),
		).rejects.toThrow(/already linked to “Project old”/);
		expect((await docFor(t, "github", "owner/alpha"))?.content).toContain("Portfolio project: Project old");
		const page = await t.query(api.projects.queries.getBySlug, { slug: "old" });
		expect(page?.githubRepo).toBe("owner/alpha");
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

describe("the GitHub sync", () => {
	const gh = (
		fullName: string,
		extra: Partial<{ private: boolean; fork: boolean; pushed_at: string }> = {},
	) => ({
		name: fullName.split("/")[1],
		full_name: fullName,
		private: false,
		fork: false,
		description: null,
		html_url: `https://github.com/${fullName}`,
		homepage: null,
		language: "TypeScript",
		languages_url: `https://api.github.com/repos/${fullName}/languages`,
		stargazers_count: 0,
		forks_count: 0,
		topics: [],
		archived: false,
		created_at: "2025-01-01T00:00:00Z",
		pushed_at: "2026-01-01T00:00:00Z",
		...extra,
	});

	// What a fake GitHub returns for each path; anything else is a 404.
	const routes: Record<string, unknown> = {
		"/users/me/repos": [gh("me/site"), gh("me/secret", { private: true }), gh("me/forked", { fork: true })],
		"/users/me/orgs": [],
		"/orgs/acme/repos": [gh("acme/tool"), gh("acme/untouched"), gh("acme/internal", { private: true })],
		"/repos/acme/tool/commits": [{ sha: "1" }],
		"/repos/acme/untouched/commits": [],
		"/repos/acme/internal/commits": [{ sha: "2" }],
		"/repos/me/site/languages": { TypeScript: 900, CSS: 100 },
		"/repos/acme/tool/languages": { Go: 1 },
	};

	beforeEach(() => {
		process.env.GITHUB_USERNAME = "me";
		process.env.GITHUB_ORGS = "acme";
		vi.stubGlobal("fetch", async (input: string | URL) => {
			const path = new URL(String(input)).pathname;
			return path in routes
				? new Response(JSON.stringify(routes[path]), { status: 200 })
				: new Response("not found", { status: 404 });
		});
	});
	afterEach(() => {
		delete process.env.GITHUB_USERNAME;
		delete process.env.GITHUB_ORGS;
		vi.unstubAllGlobals();
	});

	test("syncs own public repos and org repos with my commits, never private ones", async () => {
		const t = setup();
		const admin = await asUser(t, "user_admin", "admin");
		const result = await admin.action(api.github.actions.sync, {});
		expect(result).toMatchObject({ synced: 2, orgs: ["acme"] });

		const rows = await t.run((ctx) => ctx.db.query("githubRepos").collect());
		expect(rows.map((r) => r.fullName).toSorted((a, b) => a.localeCompare(b))).toEqual(["acme/tool", "me/site"]);
		expect(rows.find((r) => r.fullName === "me/site")?.languages).toEqual([
			{ name: "TypeScript", percent: 90 },
			{ name: "CSS", percent: 10 },
		]);
		const docs = await t.run((ctx) =>
			ctx.db
				.query("knowledgeDocs")
				.withIndex("by_source", (q) => q.eq("source", "github"))
				.collect(),
		);
		expect(docs.map((d) => d.sourceKey).toSorted((a, b) => String(a).localeCompare(String(b)))).toEqual([
			"acme/tool",
			"me/site",
		]);
	});
});
