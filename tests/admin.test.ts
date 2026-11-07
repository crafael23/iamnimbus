import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { asUser, setup, type T } from "./setup";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

type Fixture = {
	docId: Id<"knowledgeDocs">;
	postId: Id<"blogPosts">;
	projectId: Id<"projects">;
	versionId: Id<"systemPromptVersions">;
};

async function fixture(t: T): Promise<Fixture> {
	return await t.run(async (ctx) => ({
		docId: await ctx.db.insert("knowledgeDocs", {
			namespace: "history",
			title: "Doc",
			content: "Body",
			source: "manual",
			status: "ready",
			version: 1,
			updatedAt: Date.now(),
		}),
		postId: await ctx.db.insert("blogPosts", {
			slug: "a-post",
			title: "Post",
			excerpt: "",
			content: "Body",
			status: "draft",
			updatedAt: Date.now(),
		}),
		projectId: await ctx.db.insert("projects", {
			slug: "a-project",
			title: "Project",
			summary: "",
			problem: "",
			solution: "",
			stack: [],
			decisions: "",
			outcome: "",
			order: 0,
			updatedAt: Date.now(),
		}),
		versionId: await ctx.db.insert("systemPromptVersions", { content: "v1" }),
	}));
}

const project = {
	slug: "new-project",
	title: "New",
	summary: "s",
	problem: "p",
	solution: "s",
	stack: ["TS"],
	decisions: "d",
	outcome: "o",
	order: 1,
};

/**
 * Every admin-only function, with valid arguments. The meta-test below fails
 * if a new adminQuery/adminMutation/adminAction is added without a row here.
 */
const ADMIN_CALLS = {
	"analytics.queries.summary": (c: Caller) => c.query(api.analytics.queries.summary, { days: 7 }),
	"knowledge.queries.list": (c: Caller) => c.query(api.knowledge.queries.list, {}),
	"knowledge.queries.get": (c: Caller, f: Fixture) => c.query(api.knowledge.queries.get, { docId: f.docId }),
	"knowledge.queries.statusForSource": (c: Caller, f: Fixture) =>
		c.query(api.knowledge.queries.statusForSource, { source: "blog", sourceKey: f.postId }),
	"knowledge.mutations.create": (c: Caller) =>
		c.mutation(api.knowledge.mutations.create, { namespace: "skills", title: "T", content: "C" }),
	"knowledge.mutations.update": (c: Caller, f: Fixture) =>
		c.mutation(api.knowledge.mutations.update, { docId: f.docId, title: "T2", content: "C2" }),
	"knowledge.mutations.reingest": (c: Caller, f: Fixture) =>
		c.mutation(api.knowledge.mutations.reingest, { docId: f.docId }),
	"knowledge.mutations.remove": (c: Caller, f: Fixture) =>
		c.mutation(api.knowledge.mutations.remove, { docId: f.docId }),
	"blog.queries.adminList": (c: Caller) => c.query(api.blog.queries.adminList, {}),
	"blog.queries.adminGet": (c: Caller, f: Fixture) => c.query(api.blog.queries.adminGet, { postId: f.postId }),
	"blog.mutations.create": (c: Caller) =>
		c.mutation(api.blog.mutations.create, { slug: "fresh", title: "T", excerpt: "", content: "" }),
	"blog.mutations.update": (c: Caller, f: Fixture) =>
		c.mutation(api.blog.mutations.update, { postId: f.postId, slug: "a-post", title: "T", excerpt: "", content: "x" }),
	"blog.mutations.publish": (c: Caller, f: Fixture) => c.mutation(api.blog.mutations.publish, { postId: f.postId }),
	"blog.mutations.unpublish": (c: Caller, f: Fixture) => c.mutation(api.blog.mutations.unpublish, { postId: f.postId }),
	"blog.mutations.remove": (c: Caller, f: Fixture) => c.mutation(api.blog.mutations.remove, { postId: f.postId }),
	"projects.queries.adminGet": (c: Caller, f: Fixture) =>
		c.query(api.projects.queries.adminGet, { projectId: f.projectId }),
	"projects.mutations.save": (c: Caller) => c.mutation(api.projects.mutations.save, project),
	"projects.mutations.remove": (c: Caller, f: Fixture) =>
		c.mutation(api.projects.mutations.remove, { projectId: f.projectId }),
	"prompts.queries.listVersions": (c: Caller) => c.query(api.prompts.queries.listVersions, {}),
	"prompts.mutations.save": (c: Caller) => c.mutation(api.prompts.mutations.save, { content: "new prompt" }),
	"prompts.mutations.restore": (c: Caller, f: Fixture) =>
		c.mutation(api.prompts.mutations.restore, { versionId: f.versionId }),
	"github.queries.lastRun": (c: Caller) => c.query(api.github.queries.lastRun, {}),
	"github.queries.repos": (c: Caller) => c.query(api.github.queries.repos, {}),
	"github.actions.sync": (c: Caller) => c.action(api.github.actions.sync, {}),
	"users.queries.listUsersAdminOnly": (c: Caller) => c.query(api.users.queries.listUsersAdminOnly, {}),
} as const;

type Caller = Pick<T, "query" | "mutation" | "action">;

describe("admin guards", () => {
	test("every admin wrapper in convex/ is covered by this table", () => {
		const found: string[] = [];
		const walk = (dir: string) => {
			for (const name of readdirSync(dir)) {
				const path = join(dir, name);
				if (statSync(path).isDirectory()) {
					if (name !== "_generated" && name !== "_lib") walk(path);
					continue;
				}
				if (!name.endsWith(".ts")) continue;
				const src = readFileSync(path, "utf8");
				const mod = path
					.replace(/^convex\//, "")
					.replace(/\.ts$/, "")
					.replaceAll("/", ".");
				for (const m of src.matchAll(/export const (\w+) = admin(Query|Mutation|Action)\(/g)) {
					found.push(`${mod}.${m[1]}`);
				}
			}
		};
		walk("convex");
		expect(found.sort()).toEqual(Object.keys(ADMIN_CALLS).sort());
	});

	for (const [name, call] of Object.entries(ADMIN_CALLS)) {
		test(`${name} rejects anonymous callers and non-admin users`, async () => {
			const t = setup();
			const f = await fixture(t);
			await expect(call(t, f)).rejects.toThrow(/Not authenticated/);
			const member = await asUser(t, "user_member", "member");
			await expect(call(member, f)).rejects.toThrow(/Admin access required/);
			const noRole = await asUser(t, "user_norole");
			await expect(call(noRole, f)).rejects.toThrow(/Admin access required/);
		});
	}

	test("admins pass the guard", async () => {
		const t = setup();
		const f = await fixture(t);
		const admin = await asUser(t, "user_admin", "admin");
		for (const [name, call] of Object.entries(ADMIN_CALLS)) {
			if (name === "github.actions.sync") continue; // needs the network; guard-only check below
			await expect(call(admin, f), name).resolves.not.toThrow();
		}
		// sync passes the guard and then fails on configuration, not on auth.
		await expect(admin.action(api.github.actions.sync, {})).rejects.toThrow(/GITHUB_USERNAME/);
	});
});
