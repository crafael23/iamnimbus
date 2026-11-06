"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { useState } from "react";
import { SiteNav } from "@/components/SiteNav";
import { api } from "../../../convex/_generated/api";
import { BlogPanel } from "./BlogPanel";
import { GithubPanel } from "./GithubPanel";
import { KnowledgePanel, SkeletonRows } from "./KnowledgePanel";
import { ProjectsPanel } from "./ProjectsPanel";
import { PromptPanel } from "./PromptPanel";

const SECTIONS = [
	{ id: "knowledge", label: "Knowledge" },
	{ id: "blog", label: "Blog" },
	{ id: "projects", label: "Projects" },
	{ id: "prompt", label: "System prompt" },
	{ id: "github", label: "GitHub" },
] as const;

type Section = (typeof SECTIONS)[number]["id"];

/**
 * Admin shell. The role check here only decides what to render; every admin
 * query, mutation and action re-checks the role on the server.
 */
export function AdminApp() {
	const { isLoading, isAuthenticated } = useConvexAuth();
	const profile = useQuery(api.users.queries.getMyProfileOrNull, isAuthenticated ? {} : "skip");
	const [section, setSection] = useState<Section>("knowledge");

	const loading = isLoading || (isAuthenticated && profile === undefined);
	const allowed = profile?.role === "admin";

	return (
		<div className="min-h-full">
			<SiteNav />
			<div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6 lg:grid lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-12 lg:py-12">
				{loading ? (
					<div className="lg:col-span-2">
						<SkeletonRows />
					</div>
				) : !allowed ? (
					<div className="lg:col-span-2 max-w-[52ch]">
						<p className="font-display text-sm text-amber">restricted</p>
						<h1 className="mt-3 font-display text-xl text-ice">This area is for the site owner.</h1>
						<p className="mt-3 text-[13px] leading-relaxed text-fog">
							{isAuthenticated
								? "Your account does not have the admin role. Roles come from the WorkOS organization membership."
								: "Sign in with the owner account to continue."}
						</p>
					</div>
				) : (
					<>
						<nav aria-label="Admin sections" className="mb-8 lg:mb-0">
							<ul className="flex gap-1 overflow-x-auto border-b border-line lg:flex-col lg:border-b-0 lg:border-l">
								{SECTIONS.map((s) => (
									<li key={s.id}>
										<button
											type="button"
											aria-current={section === s.id ? "page" : undefined}
											onClick={() => setSection(s.id)}
											className={`-mb-px whitespace-nowrap border-b px-3 py-2 text-[13px] transition-colors lg:-ml-px lg:mb-0 lg:w-full lg:border-b-0 lg:border-l lg:text-left ${
												section === s.id
													? "border-cyan text-cyan"
													: "border-transparent text-dim hover:text-ice"
											}`}
										>
											{s.label}
										</button>
									</li>
								))}
							</ul>
						</nav>
						<main className="min-w-0">
							{section === "knowledge" && <KnowledgePanel />}
							{section === "blog" && <BlogPanel />}
							{section === "projects" && <ProjectsPanel />}
							{section === "prompt" && <PromptPanel />}
							{section === "github" && <GithubPanel />}
						</main>
					</>
				)}
			</div>
		</div>
	);
}
