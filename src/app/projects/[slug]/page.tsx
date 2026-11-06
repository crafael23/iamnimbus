import { fetchQuery } from "convex/nextjs";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Markdown } from "@/components/Markdown";
import { formatDate, PageShell } from "@/components/PageShell";
import { api } from "../../../../convex/_generated/api";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { slug } = await params;
	const project = await fetchQuery(api.projects.queries.getBySlug, { slug });
	return project
		? { title: project.title, description: project.summary }
		: { title: "Not found" };
}

const SECTIONS = [
	["problem", "The problem"],
	["solution", "What was built"],
	["decisions", "Decisions"],
	["outcome", "Outcome"],
] as const;

export default async function ProjectPage({ params }: Props) {
	const { slug } = await params;
	const project = await fetchQuery(api.projects.queries.getBySlug, { slug });
	if (!project) notFound();

	return (
		<PageShell>
			<article className="grid gap-12 lg:grid-cols-[minmax(0,68ch)_15rem] lg:justify-between">
				<div>
					<Link href="/projects" className="font-crt text-[18px] uppercase tracking-[0.1em] text-dim transition-colors hover:text-cyan">
						{"< projects"}
					</Link>
					<h1 className="mt-8 scanned font-display text-[clamp(1.3rem,4.2vw,2.15rem)] leading-[1.2] text-ice">
						{project.title}
					</h1>
					<p className="mt-6 font-prose text-[17px] leading-relaxed text-fog">{project.summary}</p>

					{SECTIONS.map(([key, label]) => (
						<section key={key} className="mt-14">
							<h2 className="font-crt text-[24px] uppercase tracking-[0.08em] text-cyan">
								<span className="text-cyan-dim">{"## "}</span>
								{label}
							</h2>
							<div className="mt-4">
								<Markdown variant="prose">{project[key]}</Markdown>
							</div>
						</section>
					))}
				</div>

				<aside className="h-fit border-t border-dashed border-line-strong pt-6 font-crt text-[19px] lg:sticky lg:top-24 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
					<dl className="space-y-6">
						{project.year && (
							<div>
								<dt className="uppercase tracking-[0.1em] text-dim">year</dt>
								<dd className="mt-1 text-ice">{project.year}</dd>
							</div>
						)}
						<div>
							<dt className="uppercase tracking-[0.1em] text-dim">stack</dt>
							<dd className="mt-2 flex flex-wrap gap-2">
								{project.stack.map((s) => (
									<span key={s} className="border border-line-strong px-2 text-cyan">
										{s}
									</span>
								))}
							</dd>
						</div>
						{project.repo && (
							<div>
								<dt className="uppercase tracking-[0.1em] text-dim">github</dt>
								<dd className="mt-1 space-y-1">
									<a
										href={project.repo.url}
										target="_blank"
										rel="noreferrer noopener"
										className="block break-all text-cyan hover:text-ice"
									>
										{project.repo.fullName} ↗
									</a>
									{project.repo.languages.length > 0 && (
										<p className="text-fog">
											{project.repo.languages
												.slice(0, 3)
												.map((l) => `${l.name} ${l.percent}%`)
												.join(" · ")}
										</p>
									)}
									<p className="text-dim">
										last push {formatDate(project.repo.pushedAt)}
										{project.repo.stars > 0 && ` · ★ ${project.repo.stars}`}
										{project.repo.archived && " · archived"}
									</p>
								</dd>
							</div>
						)}
						{((!project.repo && (project.githubRepo || project.repoUrl)) || project.liveUrl) && (
							<div>
								<dt className="uppercase tracking-[0.1em] text-dim">links</dt>
								<dd className="mt-1 space-y-1">
									{!project.repo && (project.githubRepo || project.repoUrl) && (
										<a
											href={project.githubRepo ? `https://github.com/${project.githubRepo}` : project.repoUrl}
											target="_blank"
											rel="noreferrer noopener"
											className="block text-cyan hover:text-ice"
										>
											repository ↗
										</a>
									)}
									{project.liveUrl && (
										<a href={project.liveUrl} target="_blank" rel="noreferrer noopener" className="block text-cyan hover:text-ice">
											live ↗
										</a>
									)}
								</dd>
							</div>
						)}
						<div>
							<dt className="uppercase tracking-[0.1em] text-dim">ask about it</dt>
							<dd className="mt-1">
								<Link href="/" className="text-cyan hover:text-ice">
									open the terminal →
								</Link>
							</dd>
						</div>
					</dl>
				</aside>
			</article>
		</PageShell>
	);
}
