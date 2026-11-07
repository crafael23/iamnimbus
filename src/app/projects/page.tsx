import { fetchQuery } from "convex/nextjs";
import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { api } from "../../../convex/_generated/api";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsIndex() {
	const projects = await fetchQuery(api.projects.queries.list, {});
	return (
		<PageShell>
			<header className="max-w-[68ch]">
				<h1 className="scanned font-display text-[clamp(1.6rem,5.5vw,2.8rem)] leading-[1.12] text-ice">Projects</h1>
				<p className="mt-5 font-prose text-base leading-relaxed text-fog">
					A considered selection: the problem, what was built, and the decisions behind it.
				</p>
			</header>

			{projects.length === 0 ? (
				<p className="mt-16 font-prose text-fog">No projects are published yet.</p>
			) : (
				<ul className="mt-14 max-w-[820px]">
					{projects.map((p) => (
						<li key={p._id} className="group border-t border-dashed border-line-strong first:border-t-0">
							<Link href={`/projects/${p.slug}`} className="grid gap-2 py-7 sm:grid-cols-[10rem_1fr] sm:gap-8">
								<span className="pt-1 font-crt text-[17px] uppercase tracking-[0.08em] text-dim">{p.year ?? ""}</span>
								<span>
									<span className="block font-crt text-[26px] uppercase leading-[1.1] tracking-[0.03em] text-ice transition-colors group-hover:text-cyan sm:text-[30px]">
										{p.title}
									</span>
									<span className="mt-2 block font-prose text-[15px] leading-relaxed text-fog">{p.summary}</span>
									<span className="mt-3 flex flex-wrap gap-x-3 gap-y-1 font-crt text-[17px] uppercase tracking-[0.06em] text-cyan-dim">
										{p.stack.map((s) => (
											<span key={s}>{s}</span>
										))}
									</span>
								</span>
							</Link>
						</li>
					))}
				</ul>
			)}
		</PageShell>
	);
}
