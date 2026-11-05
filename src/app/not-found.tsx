import Link from "next/link";
import { PageShell } from "@/components/PageShell";

export default function NotFound() {
	return (
		<PageShell>
			<p className="font-display text-sm text-amber">404</p>
			<h1 className="mt-4 font-display text-2xl font-light text-ice">
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
