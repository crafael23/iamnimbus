import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const components: Components = {
	a: ({ href = "", children }) => {
		if (href.startsWith("/")) {
			return <Link href={href}>{children}</Link>;
		}
		const safe = /^https?:\/\//.test(href) || href.startsWith("mailto:");
		if (!safe) return <span>{children}</span>;
		return (
			<a href={href} target="_blank" rel="noreferrer noopener">
				{children}
			</a>
		);
	},
	img: ({ src, alt }) =>
		typeof src === "string" && src.startsWith("https://") ? (
			// oxlint-disable-next-line nextjs/no-img-element
			<img src={src} alt={alt ?? ""} loading="lazy" />
		) : null,
};

/**
 * Terminal replies are model output, so they never load remote images: an
 * image URL can carry the conversation to a third party just by rendering
 * (a prompt-injection exfiltration channel). Prose is owner-written and keeps them.
 */
const terminalComponents: Components = {
	...components,
	img: ({ alt }) => (alt ? <span className="text-dim">[image: {alt}]</span> : null),
};

/** Markdown in the system's two registers: terminal replies and long-form prose. */
export function Markdown({
	children,
	variant,
	cursor,
}: {
	children: string;
	variant: "terminal" | "prose";
	/** Terminal only: draw the cursor after the last character. */
	cursor?: "typing" | "settled";
}) {
	return (
		<div className={variant === "terminal" ? "term-md" : "prose-grid"} data-cursor={cursor}>
			<ReactMarkdown remarkPlugins={[remarkGfm]} components={variant === "terminal" ? terminalComponents : components}>
				{children}
			</ReactMarkdown>
		</div>
	);
}
