"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * The glass in front of every page: scanlines, a rolling refresh band, grain,
 * flicker, vignette and curved corners. Purely decorative and click-through.
 * Now and then the signal tears for a frame. The admin gets the glass only,
 * so editing stays calm.
 */
export function CrtScreen() {
	const pathname = usePathname();
	const quiet = pathname.startsWith("/admin");
	const tear = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (quiet) return;
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
		let timer = 0;
		const root = document.documentElement;
		const schedule = () => {
			timer = window.setTimeout(glitch, 9000 + Math.random() * 14000);
		};
		const glitch = () => {
			if (!document.hidden) {
				if (tear.current) tear.current.style.top = `${8 + Math.random() * 80}%`;
				root.dataset.glitch = "";
				window.setTimeout(() => delete root.dataset.glitch, 200);
			}
			schedule();
		};
		schedule();
		return () => {
			window.clearTimeout(timer);
			delete root.dataset.glitch;
		};
	}, [quiet]);

	return (
		<div aria-hidden className="crt-overlay">
			{!quiet && (
				<>
					<div className="crt-roll" />
					<div className="crt-grain" />
					<div className="crt-flicker" />
					<div ref={tear} className="crt-tear" />
				</>
			)}
			<div className="crt-scan" style={quiet ? { opacity: 0.45 } : undefined} />
			<div className="crt-vignette" style={quiet ? { opacity: 0.6 } : undefined} />
			<div className="crt-bezel" />
		</div>
	);
}
