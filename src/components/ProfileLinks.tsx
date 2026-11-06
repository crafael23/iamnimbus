import { PROFILE_LINKS } from "../../convex/_lib/profile";

/** The owner's public profiles, as a row of phosphor links. */
export function ProfileLinks({ className = "" }: { className?: string }) {
	return (
		<span className={`inline-flex flex-wrap gap-x-5 gap-y-1 ${className}`}>
			{PROFILE_LINKS.map((link) => (
				<a
					key={link.href}
					href={link.href}
					target="_blank"
					rel="me noopener noreferrer"
					className="lowercase text-cyan underline decoration-cyan/40 underline-offset-4 transition-colors hover:text-ice hover:decoration-ice"
				>
					{link.label} ↗
				</a>
			))}
		</span>
	);
}
