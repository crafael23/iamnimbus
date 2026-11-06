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

	const linkClass = (href: string) =>
		isActive(href)
			? "reverse px-1 sm:px-1.5"
			: "px-1 text-dim transition-colors hover:text-ice sm:px-1.5";

	return (
		<header className="crt-text relative z-20 border-b border-line/80 bg-void/70 font-crt">
			<nav
				aria-label="Primary"
				className="mx-auto flex h-14 max-w-[1100px] items-center gap-2.5 px-4 text-[17px] uppercase tracking-[0.04em] sm:gap-7 sm:px-8 sm:text-[20px] sm:tracking-[0.08em]"
			>
				<Link
					href="/"
					className="scanned whitespace-nowrap font-display text-[11px] normal-case tracking-normal text-ice sm:text-[12px]"
				>
					<span className="glow-text">nimbus</span>
					<span className="hidden text-dim sm:inline">{"//"}grid</span>
				</Link>
				<ul className="flex items-center gap-0.5 sm:gap-4">
					{LINKS.map((link) => (
						<li key={link.href}>
							<Link
								href={link.href}
								aria-current={isActive(link.href) ? "page" : undefined}
								className={linkClass(link.href)}
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
								className={linkClass("/admin")}
							>
								admin
							</Link>
						</li>
					)}
				</ul>
				<div className="ml-auto flex items-center gap-4 pl-1">
					{status}
					{loading ? null : user ? (
						<button
							type="button"
							onClick={() => void signOut()}
							className="whitespace-nowrap uppercase text-dim transition-colors hover:text-ice"
						>
							sign out
						</button>
					) : (
						// Route handler that redirects to WorkOS, not a page: a plain anchor on purpose.
						// oxlint-disable-next-line nextjs/no-html-link-for-pages
						<a
							href="/sign-in"
							className="whitespace-nowrap text-cyan transition-colors hover:text-ice"
						>
							sign in
						</a>
					)}
				</div>
			</nav>
		</header>
	);
}
