import { fetchQuery } from "convex/nextjs";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Markdown } from "@/components/Markdown";
import { PageShell } from "@/components/PageShell";
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
					<Link href="/projects" className="text-[13px] text-dim transition-colors hover:text-cyan">
						{"← projects"}
					</Link>
					<h1 className="mt-8 font-display text-[clamp(1.7rem,4.6vw,2.6rem)] font-light leading-[1.15] tracking-[-0.02em] text-ice">
						{project.title}
					</h1>
					<p className="mt-5 font-prose text-xl leading-relaxed text-fog">{project.summary}</p>

					{SECTIONS.map(([key, label]) => (
						<section key={key} className="mt-14">
							<h2 className="font-display text-[13px] tracking-[0.04em] text-cyan">{label}</h2>
							<div className="mt-4">
								<Markdown variant="prose">{project[key]}</Markdown>
							</div>
						</section>
					))}
				</div>

				<aside className="h-fit border-t border-line pt-6 text-[13px] lg:sticky lg:top-24 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
					<dl className="space-y-6">
						{project.year && (
							<div>
								<dt className="text-dim">year</dt>
								<dd className="mt-1 text-ice">{project.year}</dd>
							</div>
						)}
						<div>
							<dt className="text-dim">stack</dt>
							<dd className="mt-2 flex flex-wrap gap-2">
								{project.stack.map((s) => (
									<span key={s} className="border border-line px-2 py-0.5 text-cyan">
										{s}
									</span>
								))}
							</dd>
						</div>
						{(project.repoUrl || project.liveUrl) && (
							<div>
								<dt className="text-dim">links</dt>
								<dd className="mt-1 space-y-1">
									{project.repoUrl && (
										<a href={project.repoUrl} target="_blank" rel="noreferrer noopener" className="block text-cyan hover:text-ice">
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
							<dt className="text-dim">ask about it</dt>
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
