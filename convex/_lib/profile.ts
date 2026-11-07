/**
 * The owner's public profiles. One list for the website (boot screen and page
 * footers) and the agent's system prompt, so both always agree. No Convex or
 * Node imports: the Next app imports this file too.
 */
export const PROFILE_LINKS = [
	{ label: "GitHub", href: "https://github.com/crafael23" },
	{ label: "LinkedIn", href: "https://www.linkedin.com/in/claudio-v-5a906ab9/" },
] as const;

/** The system prompt section that tells the agent where the owner can be found. */
export function profileLinksSection() {
	return [
		"## The owner's public profiles",
		...PROFILE_LINKS.map((l) => `- ${l.label}: ${l.href}`),
		"These are on record: share them as Markdown links whenever a visitor asks how to reach, follow or learn more about the owner.",
	].join("\n");
}
