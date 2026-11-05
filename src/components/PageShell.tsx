import type { ReactNode } from "react";
import { SiteNav } from "./SiteNav";

/** Long-form surfaces: calm wall grid, no floor, readable column. */
export function PageShell({ children }: { children: ReactNode }) {
	return (
		<div className="relative min-h-[100dvh] bg-void">
			<div aria-hidden className="grid-wall" />
			<SiteNav />
			<main className="relative z-10 mx-auto max-w-[1100px] px-4 pb-24 pt-12 sm:px-6 sm:pt-20">
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
