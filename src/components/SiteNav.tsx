"use client";

import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { useConvexAuth, useQuery } from "convex/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { api } from "../../convex/_generated/api";

const LINKS = [
	{ href: "/", label: "terminal" },
	{ href: "/projects", label: "projects" },
	{ href: "/blog", label: "blog" },
];

/** Shared top bar for the terminal, blog, projects and admin. */
export function SiteNav({ status }: { status?: ReactNode }) {
	const pathname = usePathname();
	const { user, signOut, loading } = useAuth();
	const { isAuthenticated } = useConvexAuth();
	const profile = useQuery(
		api.users.queries.getMyProfileOrNull,
		isAuthenticated ? {} : "skip",
	);

	const isActive = (href: string) =>
		href === "/" ? pathname === "/" : pathname.startsWith(href);

	return (
		<header className="relative z-20 border-b border-line/70 bg-void/80 backdrop-blur-sm">
			<nav
				aria-label="Primary"
				className="mx-auto flex h-14 max-w-[1100px] items-center gap-4 px-4 text-[12px] sm:gap-7 sm:px-6 sm:text-[13px]"
			>
				<Link
					href="/"
					className="font-display text-[12px] tracking-[0.08em] text-ice whitespace-nowrap"
				>
					<span className="glow-text">nimbus</span>
					<span className="hidden text-dim sm:inline">{"//"}grid</span>
				</Link>
				<ul className="flex items-center gap-3.5 sm:gap-6">
					{LINKS.map((link) => (
						<li key={link.href}>
							<Link
								href={link.href}
								aria-current={isActive(link.href) ? "page" : undefined}
								className={
									isActive(link.href)
										? "text-cyan"
										: "text-dim transition-colors hover:text-ice"
								}
							>
								{link.label}
							</Link>
						</li>
					))}
					{profile?.role === "admin" && (
						<li className="hidden sm:block">
							<Link
								href="/admin"
								aria-current={isActive("/admin") ? "page" : undefined}
								className={
									isActive("/admin")
										? "text-cyan"
										: "text-dim transition-colors hover:text-ice"
								}
							>
								admin
							</Link>
						</li>
					)}
				</ul>
				<div className="ml-auto flex items-center gap-4 pl-2">
					{status}
					{loading ? null : user ? (
						<button
							type="button"
							onClick={() => void signOut()}
							className="text-dim transition-colors hover:text-ice whitespace-nowrap"
						>
							sign out
						</button>
					) : (
						// Route handler that redirects to WorkOS, not a page: a plain anchor on purpose.
						// oxlint-disable-next-line nextjs/no-html-link-for-pages
						<a
							href="/sign-in"
							className="text-cyan transition-colors hover:text-ice whitespace-nowrap"
						>
							sign in
						</a>
					)}
				</div>
			</nav>
		</header>
	);
}
