import { fetchQuery } from "convex/nextjs";
import type { Metadata } from "next";
import Link from "next/link";
import { formatDate, PageShell } from "@/components/PageShell";
import { api } from "../../../convex/_generated/api";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Writing" };

export default async function BlogIndex() {
	const posts = await fetchQuery(api.blog.queries.listPublished, {});
	return (
		<PageShell>
			<header className="max-w-[68ch]">
				<h1 className="font-display text-[clamp(1.8rem,5vw,2.75rem)] font-light leading-[1.1] tracking-[-0.02em] text-ice">
					Writing
				</h1>
				<p className="mt-4 font-prose text-lg leading-relaxed text-fog">
					Long-form notes on building things. Every post here is also in the
					terminal&apos;s memory.
				</p>
			</header>

			{posts.length === 0 ? (
				<p className="mt-16 font-prose text-fog">
					Nothing published yet. The terminal on the{" "}
					<Link href="/" className="text-cyan underline underline-offset-4">
						home page
					</Link>{" "}
					is open in the meantime.
				</p>
			) : (
				<ol className="mt-14 max-w-[820px]">
					{posts.map((post) => (
						<li key={post._id} className="group border-t border-line first:border-t-0">
							<Link
								href={`/blog/${post.slug}`}
								className="grid gap-2 py-8 sm:grid-cols-[9rem_1fr] sm:gap-8"
							>
								<span className="pt-1 text-[12px] text-dim">
									{post.publishedAt ? formatDate(post.publishedAt) : ""}
									<span className="mt-1 block">{post.readingMinutes} min read</span>
								</span>
								<span>
									<span className="block font-display text-lg leading-snug text-ice transition-colors group-hover:text-cyan sm:text-xl">
										{post.title}
									</span>
									<span className="mt-2 block font-prose text-base leading-relaxed text-fog">
										{post.excerpt}
									</span>
								</span>
							</Link>
						</li>
					))}
				</ol>
			)}
		</PageShell>
	);
}
