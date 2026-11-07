import Link from "next/link";
import { PageShell } from "@/components/PageShell";

export default function NotFound() {
	return (
		<PageShell>
			<p className="font-crt text-[20px] uppercase tracking-[0.14em] glow-amber">error 404 · no signal</p>
			<h1 className="scanned mt-5 font-display text-[clamp(1.2rem,4vw,1.9rem)] leading-[1.25] text-ice">
				Nothing on the grid at this address.
			</h1>
			<p className="mt-4 font-prose text-fog">
				It may be unpublished or the link may be wrong.{" "}
				<Link href="/" className="text-cyan underline underline-offset-4">
					Back to the terminal
				</Link>
			</p>
		</PageShell>
	);
}
