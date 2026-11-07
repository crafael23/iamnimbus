import { ConvexError } from "convex/values";
import { internal } from "../_generated/api";
import { env } from "../_generated/server";
import { adminAction } from "../_lib/customFunctions";

const API = "https://api.github.com";
const MAX_REPOS = 100;
const MAX_README_CHARS = 12_000;
const MAX_PAGES = 10;
const CONCURRENCY = 6;

type GithubRepo = {
	name: string;
	full_name: string;
	private: boolean;
	description: string | null;
	html_url: string;
	homepage: string | null;
	language: string | null;
	languages_url: string;
	stargazers_count: number;
	forks_count: number;
	topics?: string[];
	fork: boolean;
	archived: boolean;
	created_at: string;
	pushed_at: string | null;
};

function headers(accept = "application/vnd.github+json") {
	const h: Record<string, string> = {
		Accept: accept,
		"User-Agent": "portfolio-os-sync",
		"X-GitHub-Api-Version": "2022-11-28",
	};
	if (env.GITHUB_TOKEN) {
		h.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
	}
	return h;
}

function failure(res: Response, url: string) {
	const limited = res.headers.get("x-ratelimit-remaining") === "0";
	return new Error(
		limited
			? "GitHub API rate limit reached for this deployment's IP. Set GITHUB_TOKEN in Convex env."
			: `GitHub ${res.status} for ${new URL(url).pathname}`,
	);
}

async function getJson<T>(url: string): Promise<T> {
	const res = await fetch(url, { headers: headers() });
	if (!res.ok) throw failure(res, url);
	return (await res.json()) as T;
}

/** Every page of a list endpoint (up to MAX_PAGES of 100). */
async function getAll<T>(url: string): Promise<T[]> {
	const all: T[] = [];
	for (let page = 1; page <= MAX_PAGES; page++) {
		const batch = await getJson<T[]>(`${url}${url.includes("?") ? "&" : "?"}per_page=100&page=${page}`);
		all.push(...batch);
		if (batch.length < 100) break;
	}
	return all;
}

async function getReadme(fullName: string): Promise<string | null> {
	const url = `${API}/repos/${fullName}/readme`;
	const res = await fetch(url, { headers: headers("application/vnd.github.raw+json") });
	if (res.status === 404) return null;
	if (!res.ok) throw failure(res, url);
	const text = await res.text();
	return text.length > MAX_README_CHARS
		? `${text.slice(0, MAX_README_CHARS)}\n\n[README truncated]`
		: text;
}

/** Whether `username` authored at least one commit in the repo. */
async function hasCommitsBy(fullName: string, username: string) {
	const url = `${API}/repos/${fullName}/commits?author=${encodeURIComponent(username)}&per_page=1`;
	const res = await fetch(url, { headers: headers() });
	// 409: empty repository. 404: gone or not visible.
	if (res.status === 409 || res.status === 404) return false;
	if (!res.ok) throw failure(res, url);
	return ((await res.json()) as unknown[]).length > 0;
}

/** Map with at most `limit` requests in flight. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
	const out: R[] = [];
	let next = 0;
	const worker = async () => {
		while (next < items.length) {
			const i = next++;
			out[i] = await fn(items[i] as T);
		}
	};
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
	return out;
}

/** Each language's share of the code, largest first, in whole percent. */
function languageShares(languages: Record<string, number>) {
	const total = Object.values(languages).reduce((a, b) => a + b, 0);
	if (!total) return [];
	return Object.entries(languages)
		.sort((a, b) => b[1] - a[1])
		.map(([name, bytes]) => ({ name, percent: Math.round((bytes / total) * 100) }))
		.filter((l) => l.percent > 0);
}

/** Public, original work only: private repos are never synced, whatever the token can see. */
const isPublicSource = (r: GithubRepo) => !r.private && !r.fork;

/** Organizations to scan: GITHUB_ORGS plus any public memberships. */
async function organizations(username: string) {
	const configured = (env.GITHUB_ORGS ?? "")
		.split(",")
		.map((o) => o.trim())
		.filter(Boolean);
	const memberships = await getJson<{ login: string }[]>(
		`${API}/users/${encodeURIComponent(username)}/orgs`,
	);
	const seen = new Map<string, string>();
	for (const login of [...configured, ...memberships.map((m) => m.login)]) {
		if (!seen.has(login.toLowerCase())) seen.set(login.toLowerCase(), login);
	}
	return [...seen.values()];
}

/**
 * Pull public, non-fork repos into `githubRepos` and one `github` knowledge
 * doc per repo: every repo the owner owns, plus organization repos they have
 * committed to. Private repos are never included. Repos that disappeared are
 * removed. Idempotent: unchanged repos are not re-embedded.
 */
export const sync = adminAction({
	args: {},
	handler: async (ctx): Promise<{ synced: number; removed: number; orgs: string[] }> => {
		const username = env.GITHUB_USERNAME;
		if (!username) throw new ConvexError("GITHUB_USERNAME is not set");
		try {
			const own = (
				await getAll<GithubRepo>(
					`${API}/users/${encodeURIComponent(username)}/repos?type=owner&sort=pushed`,
				)
			).filter(isPublicSource);

			const orgs = await organizations(username);
			const orgRepos = (
				await Promise.all(
					orgs.map((org) =>
						getAll<GithubRepo>(`${API}/orgs/${encodeURIComponent(org)}/repos?type=public&sort=pushed`),
					),
				)
			)
				.flat()
				.filter(isPublicSource);
			const authored = await mapLimit(orgRepos, CONCURRENCY, (r) =>
				hasCommitsBy(r.full_name, username),
			);
			const contributed = orgRepos.filter((_, i) => authored[i]);

			const byKey = new Map<string, GithubRepo>();
			for (const r of [...own, ...contributed]) byKey.set(r.full_name.toLowerCase(), r);
			const repos = [...byKey.values()]
				.sort((a, b) => Date.parse(b.pushed_at ?? b.created_at) - Date.parse(a.pushed_at ?? a.created_at))
				.slice(0, MAX_REPOS);

			const synced = await mapLimit(repos, CONCURRENCY, async (repo) => {
				const [languages, readme] = await Promise.all([
					getJson<Record<string, number>>(repo.languages_url),
					getReadme(repo.full_name),
				]);
				const shares = languageShares(languages);
				return {
					fullName: repo.full_name,
					name: repo.name,
					url: repo.html_url,
					description: repo.description ?? undefined,
					homepage: repo.homepage || undefined,
					languages: shares.length
						? shares
						: repo.language
							? [{ name: repo.language, percent: 100 }]
							: [],
					topics: repo.topics ?? [],
					stars: repo.stargazers_count,
					forks: repo.forks_count,
					archived: repo.archived,
					createdAt: Date.parse(repo.created_at),
					pushedAt: Date.parse(repo.pushed_at ?? repo.created_at),
					readme: readme ?? undefined,
				};
			});
			const result = await ctx.runMutation(internal.github.mutations.applySync, {
				username,
				repos: synced,
			});
			return { ...result, orgs };
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			await ctx.runMutation(internal.github.mutations.recordFailure, {
				username,
				error: message,
			});
			throw new ConvexError(`GitHub sync failed: ${message}`);
		}
	},
});
