"use client";

import { Chat } from "@/components/Chat";
import { Authenticated, Unauthenticated, useQuery } from "convex/react";
import { useAuth } from "@workos-inc/authkit-nextjs/components";
import Link from "next/link";
import { api } from "../../convex/_generated/api";

export default function Home() {
	const { user, signOut } = useAuth();

	return (
		<div className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
			<div className="max-w-2xl mx-auto">
				<div className="flex justify-between items-center mb-8">
					<h1 className="text-2xl font-semibold">Convex + AuthKit</h1>
					<div className="flex gap-2">
						{user ? (
							<button
								onClick={() => void signOut()}
								className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm font-medium transition-colors"
							>
								Sign out
							</button>
						) : (
							<>
								<Link href="/sign-in">
									<button className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm font-medium transition-colors">
										Sign in
									</button>
								</Link>
								<Link href="/sign-up">
									<button className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-900 text-sm font-medium transition-colors">
										Sign up
									</button>
								</Link>
							</>
						)}
					</div>
				</div>

				<Authenticated>
					<AuthenticatedGreeting />
					<div className="mt-6">
						<UserProfile />
					</div>
					<div className="mt-6">
						<h2 className="text-lg font-medium mb-3">Chat</h2>
						<Chat />
					</div>
				</Authenticated>

				<Unauthenticated>
					<GuestGreeting />
					<div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
						<p className="text-zinc-400">
							Sign in to see your profile and get started.
						</p>
						<div className="mt-4 flex justify-center gap-2">
							<Link href="/sign-in">
								<button className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm font-medium">
									Sign in
								</button>
							</Link>
							<Link href="/sign-up">
								<button className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-900 text-sm font-medium">
									Sign up
								</button>
							</Link>
						</div>
					</div>
				</Unauthenticated>
			</div>
		</div>
	);
}

function GuestGreeting() {
	const greeting = useQuery(api.demo.queries.publicGreeting);
	if (greeting === undefined) return null;
	return (
		<div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-6 py-4">
			<p className="text-zinc-300">{greeting.message}</p>
			<span className="inline-block mt-2 text-xs text-zinc-500 uppercase tracking-wider">
				{greeting.role}
			</span>
		</div>
	);
}

function AuthenticatedGreeting() {
	const userGreeting = useQuery(api.demo.queries.userGreeting);
	const adminGreeting = useQuery(
		api.demo.queries.adminGreeting,
		userGreeting?.role === "admin" ? {} : "skip",
	);

	const greeting = adminGreeting ?? userGreeting;
	if (greeting === undefined) return null;

	return (
		<div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-6 py-4">
			<p className="text-zinc-300">{greeting.message}</p>
			<span className="inline-block mt-2 text-xs text-zinc-500 uppercase tracking-wider">
				{greeting.role}
			</span>
		</div>
	);
}

function UserProfile() {
	const profile = useQuery(api.users.queries.getMyProfileOrNull);

	if (profile === undefined) {
		return (
			<div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8">
				<div className="animate-pulse flex gap-4">
					<div className="size-16 rounded-full bg-zinc-700" />
					<div className="flex-1 space-y-3">
						<div className="h-5 w-1/3 rounded bg-zinc-700" />
						<div className="h-4 w-1/2 rounded bg-zinc-700" />
					</div>
				</div>
			</div>
		);
	}

	if (profile === null) {
		return (
			<div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
				<p className="text-zinc-400">
					Setting up your profile&hellip; This usually takes a moment.
				</p>
			</div>
		);
	}

	return (
		<div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
			<div className="flex gap-4 items-start">
				{profile.pictureUrl ? (
					// oxlint-disable-next-line nextjs/no-img-element
					<img
						src={profile.pictureUrl}
						alt={profile.name}
						className="size-16 rounded-full object-cover"
					/>
				) : (
					<div className="size-16 rounded-full bg-amber-500/20 flex items-center justify-center text-2xl font-bold text-amber-400">
						{profile.name?.charAt(0) ?? "?"}
					</div>
				)}
				<div className="flex-1 min-w-0">
					<h2 className="text-xl font-semibold truncate">{profile.name}</h2>
					<p className="text-zinc-400 text-sm truncate">{profile.email}</p>
					<span className="inline-block mt-2 px-2 py-0.5 rounded text-xs font-medium bg-zinc-800 text-zinc-300 capitalize">
						{profile.role}
					</span>
				</div>
			</div>
		</div>
	);
}
