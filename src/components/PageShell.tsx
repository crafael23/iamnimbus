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
			<footer className="crt-text relative z-10 mx-auto max-w-[1100px] px-5 pb-16 font-crt text-[17px] sm:px-8">
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
