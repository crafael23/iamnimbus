import type { ReactNode } from "react";
import { SiteNav } from "./SiteNav";

/** Long-form surfaces: the same tube, a readable column. */
export function PageShell({ children }: { children: ReactNode }) {
	return (
		<div className="relative min-h-full">
			<SiteNav />
			<main className="screen-in crt-text relative z-10 mx-auto max-w-[1100px] px-5 pb-28 pt-12 sm:px-8 sm:pt-20">
				{children}
			</main>
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
