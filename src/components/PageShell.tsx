import type { ReactNode } from "react";
import { ProfileLinks } from "./ProfileLinks";
import { SiteNav } from "./SiteNav";

/** Long-form surfaces: the same tube, a readable column. */
export function PageShell({ children }: { children: ReactNode }) {
	return (
		<div className="relative min-h-full">
			<SiteNav />
			<main className="screen-in crt-text relative z-10 mx-auto max-w-[1100px] px-5 pb-16 pt-12 sm:px-8 sm:pt-20">
				{children}
			</main>
			<footer className="crt-text relative z-10 mx-auto flex max-w-[1100px] flex-wrap items-baseline gap-x-6 gap-y-2 border-t border-dashed border-line-strong px-5 pb-20 pt-6 font-crt text-[18px] sm:px-8">
				<span className="uppercase tracking-[0.1em] text-dim">elsewhere</span>
				<ProfileLinks />
			</footer>
		</div>
	);
}

export function formatDate(ms: number) {
	return new Date(ms).toLocaleDateString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
		timeZone: "UTC",
	});
}
