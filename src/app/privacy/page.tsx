import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PageShell } from "@/components/PageShell";
import { ProfileLinks } from "@/components/ProfileLinks";

export const metadata: Metadata = {
	title: "Privacy",
	description: "What this site stores about visitors, and for how long.",
};

/** Bump when the page changes in substance. */
const UPDATED = "6 November 2026";

export default function Privacy() {
	return (
		<PageShell>
			<article className="max-w-[68ch]">
				<header>
					<h1 className="scanned font-display text-[clamp(1.6rem,5.5vw,2.8rem)] leading-[1.12] text-ice">Privacy</h1>
					<p className="mt-5 font-prose text-base leading-relaxed text-fog">
						This is a personal portfolio with an AI terminal. It keeps what it needs to run the chat and count usage,
						and nothing for advertising or cross-site tracking. There is no cookie banner because the only cookies are
						the ones the site needs to work.
					</p>
					<p className="mt-4 font-crt text-[17px] uppercase tracking-[0.08em] text-dim">Updated {UPDATED}</p>
				</header>

				<Section title="Cookies and browser storage">
					<Item name="grid_guest cookie">
						A signed, random guest id that lets the site count your 10 guest messages. It is only sent to this
						site&apos;s guest endpoint and expires after 30 days.
					</Item>
					<Item name="Sign-in cookie">
						Set by WorkOS, the sign-in provider, when you sign in. It keeps you signed in.
					</Item>
					<Item name="Session storage">
						Whether the intro has played and which guest conversation is open. Your browser clears it when you close the
						tab.
					</Item>
				</Section>

				<Section title="What the chat keeps">
					<Item name="Messages">
						Everything you send and every reply is stored so the conversation can continue and so I can see where the
						answers fall short. There is no automatic deletion yet; ask me to delete a conversation and I will.
					</Item>
					<Item name="Your account">
						If you sign in, your name, email address and profile picture from WorkOS, so the site knows who you are and
						how many messages you have left today.
					</Item>
					<Item name="Your network">
						Guest limits also apply per network, so one person cannot reset them by clearing cookies. The site shortens
						your IP address to its network (the first three parts of an IPv4 address, or the first half of an IPv6 one)
						and stores only a keyed hash of that. The full address is not stored. The hosting provider, Vercel, keeps
						its own short-lived request logs.
					</Item>
				</Section>

				<Section title="Usage counts">
					<p>
						To see whether the terminal is useful, the site counts per day: conversations started, messages sent, guests
						who reach the limit, guests who later sign in, and a broad topic for each question (for example
						&quot;projects&quot; or &quot;skills&quot;). These counts contain no message text, IP address or account.
						They are deleted after 180 days.
					</p>
				</Section>

				<Section title="Who else sees your messages">
					<p>
						Replies are written by Anthropic&apos;s Claude models, and a separate safety model checks each message
						first. Both are reached through Convex, which also hosts the database. When the assistant searches my
						records, OpenAI turns its search phrase into an embedding. None of these services is used to advertise to
						you.
					</p>
				</Section>

				<Section title="Questions or deletion">
					<p>Reach me through either profile and I&apos;ll answer or delete your data.</p>
					<p className="mt-3 font-crt text-[19px]">
						<ProfileLinks />
					</p>
				</Section>
			</article>
		</PageShell>
	);
}

function Section({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="mt-12 border-t border-dashed border-line-strong pt-8">
			<h2 className="font-crt text-[24px] uppercase leading-[1.1] tracking-[0.04em] text-ice sm:text-[26px]">
				{title}
			</h2>
			<div className="mt-4 font-prose text-[15px] leading-relaxed text-fog">{children}</div>
		</section>
	);
}

function Item({ name, children }: { name: string; children: ReactNode }) {
	return (
		<div className="mt-5 first:mt-0 sm:grid sm:grid-cols-[11rem_1fr] sm:gap-6">
			<p className="font-crt text-[18px] uppercase tracking-[0.06em] text-cyan-dim">{name}</p>
			<p className="mt-1 sm:mt-0">{children}</p>
		</div>
	);
}
