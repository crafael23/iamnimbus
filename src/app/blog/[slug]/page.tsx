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
	const post = await fetchQuery(api.blog.queries.getPublishedBySlug, { slug });
	return post
		? { title: post.title, description: post.excerpt }
		: { title: "Not found" };
}

export default async function BlogPost({ params }: Props) {
	const { slug } = await params;
	const post = await fetchQuery(api.blog.queries.getPublishedBySlug, { slug });
	if (!post) notFound();

	return (
		<PageShell>
			<article className="mx-auto max-w-[68ch]">
				<Link href="/blog" className="text-[13px] text-dim transition-colors hover:text-cyan">
					{"← writing"}
				</Link>
				<header className="mt-8 border-b border-line pb-8">
					<h1 className="font-display text-[clamp(1.7rem,4.6vw,2.6rem)] font-light leading-[1.15] tracking-[-0.02em] text-ice">
						{post.title}
					</h1>
					<p className="mt-5 text-[13px] text-dim">
						{post.publishedAt ? formatDate(post.publishedAt) : ""}
						<span className="mx-2 text-line-strong">/</span>
						{post.readingMinutes} min read
					</p>
				</header>
				<div className="mt-10">
					<Markdown variant="prose">{post.content}</Markdown>
				</div>
				<footer className="mt-16 border-t border-line pt-8 font-prose text-fog">
					Questions about this post?{" "}
					<Link href="/" className="text-cyan underline underline-offset-4">
						Ask the terminal
					</Link>
					. It has read it.
				</footer>
			</article>
		</PageShell>
	);
}
