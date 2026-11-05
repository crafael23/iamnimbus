import { ConvexError } from "convex/values";
import { internal } from "../_generated/api";
import { adminAction } from "../_lib/customFunctions";

const MAX_REPOS = 40;
const MAX_README_CHARS = 12_000;

type GithubRepo = {
	name: string;
	full_name: string;
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
	pushed_at: string;
};

function headers(accept = "application/vnd.github+json") {
	const h: Record<string, string> = {
		Accept: accept,
		"User-Agent": "portfolio-os-sync",
		"X-GitHub-Api-Version": "2022-11-28",
	};
	if (process.env.GITHUB_TOKEN) {
		h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
	}
	return h;
}

async function getJson<T>(url: string): Promise<T> {
	const res = await fetch(url, { headers: headers() });
	if (!res.ok) {
		const limited = res.headers.get("x-ratelimit-remaining") === "0";
		throw new Error(
			limited
				? "GitHub API rate limit reached for this deployment's IP. Set GITHUB_TOKEN in Convex env."
				: `GitHub ${res.status} for ${new URL(url).pathname}`,
		);
	}
	return (await res.json()) as T;
}

async function getReadme(fullName: string): Promise<string | null> {
	const res = await fetch(`https://api.github.com/repos/${fullName}/readme`, {
		headers: headers("application/vnd.github.raw+json"),
	});
	if (res.status === 404) return null;
	if (!res.ok) throw new Error(`GitHub ${res.status} for ${fullName} README`);
	const text = await res.text();
	return text.length > MAX_README_CHARS
		? `${text.slice(0, MAX_README_CHARS)}\n\n[README truncated]`
		: text;
}

export function repoDocument(
	repo: GithubRepo,
	languages: Record<string, number>,
	readme: string | null,
) {
	const total = Object.values(languages).reduce((a, b) => a + b, 0);
	const languageLine = Object.entries(languages)
		.sort((a, b) => b[1] - a[1])
		.map(([lang, bytes]) => `${lang} ${Math.round((bytes / total) * 100)}%`)
		.join(", ");
	const lines = [
		`GitHub repository ${repo.full_name}`,
		repo.description ?? "No description.",
		`URL: ${repo.html_url}`,
		repo.homepage ? `Homepage: ${repo.homepage}` : null,
		`Languages: ${languageLine || repo.language || "unknown"}`,
		repo.topics?.length ? `Topics: ${repo.topics.join(", ")}` : null,
		`Stars: ${repo.stargazers_count}. Forks: ${repo.forks_count}.`,
		`Created ${repo.created_at.slice(0, 10)}, last pushed ${repo.pushed_at.slice(0, 10)}.`,
		repo.archived ? "Archived." : null,
		readme ? `## README\n${readme}` : "No README.",
	];
	return lines.filter(Boolean).join("\n");
}

/**
 * Pull the owner's public, non-fork repos and upsert one `github` knowledge
 * doc per repo. Repos that disappeared are removed. Idempotent: unchanged
 * repos are not re-embedded.
 */
export const sync = adminAction({
	args: {},
	handler: async (ctx): Promise<{ synced: number; removed: number }> => {
		const username = process.env.GITHUB_USERNAME;
		if (!username) throw new ConvexError("GITHUB_USERNAME is not set");
		try {
			const repos = (
				await getJson<GithubRepo[]>(
					`https://api.github.com/users/${encodeURIComponent(username)}/repos?type=owner&sort=pushed&per_page=100`,
				)
			)
				.filter((r) => !r.fork)
				.slice(0, MAX_REPOS);
			const docs = [];
			for (const repo of repos) {
				const [languages, readme] = await Promise.all([
					getJson<Record<string, number>>(repo.languages_url),
					getReadme(repo.full_name),
				]);
				docs.push({
					fullName: repo.full_name,
					title: `${repo.name} (GitHub)`,
					content: repoDocument(repo, languages, readme),
				});
			}
			return await ctx.runMutation(internal.github.mutations.applySync, {
				username,
				repos: docs,
			});
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
