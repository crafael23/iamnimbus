"use client";

import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";

/** Barrel strength: a corner moves inward by CURVE / 4 of the screen's size. */
const CURVE = 0.075;

type Curve = { url: string; scale: number; width: number; height: number };

/**
 * A displacement map for feDisplacementMap. Each output pixel samples the
 * page from a point pushed outward by r² (barrel distortion), so straight
 * lines bow like the face of a convex tube and the corners fall into the
 * bezel. Red carries x, green carries y, 0.5 means no displacement.
 */
function barrelMap(width: number, height: number): Curve | null {
	// Half resolution is smooth enough once scaled, and keeps resizes cheap.
	const mw = Math.max(64, Math.round(width / 2));
	const mh = Math.max(64, Math.round(height / 2));
	const canvas = document.createElement("canvas");
	canvas.width = mw;
	canvas.height = mh;
	const ctx = canvas.getContext("2d");
	if (!ctx) return null;
	const image = ctx.createImageData(mw, mh);
	const scale = 0.25 * CURVE * Math.max(width, height) * 2.2;
	for (let j = 0; j < mh; j++) {
		for (let i = 0; i < mw; i++) {
			const x = (i + 0.5) / mw - 0.5;
			const y = (j + 0.5) / mh - 0.5;
			const r2 = x * x + y * y;
			const dx = x * r2 * CURVE * width;
			const dy = y * r2 * CURVE * height;
			const k = (j * mw + i) * 4;
			image.data[k] = Math.round((0.5 + dx / scale) * 255);
			image.data[k + 1] = Math.round((0.5 + dy / scale) * 255);
			image.data[k + 2] = 128;
			image.data[k + 3] = 255;
		}
	}
	ctx.putImageData(image, 0, 0);
	return { url: canvas.toDataURL("image/png"), scale, width, height };
}

/**
 * The tube every page lives in: a fixed screen that scrolls inside itself,
 * bent by true barrel curvature on desktop browsers that render SVG filters
 * well, behind a layer of glass (scanlines, a drifting refresh band, edge
 * falloff and a reflection). Safari and
 * touch devices keep the glass without the distortion. The admin stays flat
 * so editing stays precise.
 */
export function CrtScreen({ children }: { children: ReactNode }) {
	const pathname = usePathname();
	const quiet = pathname.startsWith("/admin");
	const screen = useRef<HTMLDivElement>(null);
	const scroller = useRef<HTMLDivElement>(null);
	const [curve, setCurve] = useState<Curve | null>(null);

	// The window no longer scrolls, so start each page at the top ourselves.
	useEffect(() => {
		scroller.current?.scrollTo(0, 0);
	}, [pathname]);

	useEffect(() => {
		const el = screen.current;
		if (!el) return;
		const ua = navigator.userAgent;
		const webkit =
			/iP(hone|ad|od)/.test(ua) || (/Safari\//.test(ua) && !/Chrome|Chromium|Edg\//.test(ua));
		if (webkit) return;
		const wide = window.matchMedia("(min-width: 768px) and (pointer: fine)");
		const raf = { id: 0 };
		const update = () => {
			cancelAnimationFrame(raf.id);
			raf.id = requestAnimationFrame(() => {
				const { width, height } = el.getBoundingClientRect();
				setCurve(wide.matches ? barrelMap(Math.round(width), Math.round(height)) : null);
			});
		};
		update();
		const observer = new ResizeObserver(update);
		observer.observe(el);
		wide.addEventListener("change", update);
		return () => {
			cancelAnimationFrame(raf.id);
			observer.disconnect();
			wide.removeEventListener("change", update);
		};
	}, []);

	const curved = curve && !quiet;

	return (
		<>
			<div
				ref={screen}
				className="crt-screen"
				style={curved ? { filter: "url(#crt-curve)" } : undefined}
			>
				<div ref={scroller} className="crt-scroll">
					{children}
				</div>
			</div>
			{/* The glass sits in front of the bent image, so it stays crisp. */}
			<div aria-hidden className="crt-screen crt-overlay">
				{!quiet && <div className="crt-roll" />}
				<div className="crt-scan" style={quiet ? { opacity: 0.4 } : undefined} />
				<div className="crt-glare" />
				<div className="crt-vignette" style={quiet ? { opacity: 0.5 } : undefined} />
			</div>
			{curve && (
				<svg aria-hidden width="0" height="0" className="pointer-events-none absolute">
					<filter
						id="crt-curve"
						x="0"
						y="0"
						width={curve.width}
						height={curve.height}
						filterUnits="userSpaceOnUse"
						primitiveUnits="userSpaceOnUse"
						colorInterpolationFilters="sRGB"
					>
						<feImage
							href={curve.url}
							x="0"
							y="0"
							width={curve.width}
							height={curve.height}
							preserveAspectRatio="none"
							result="map"
						/>
						<feDisplacementMap
							in="SourceGraphic"
							in2="map"
							scale={curve.scale}
							xChannelSelector="R"
							yChannelSelector="G"
							result="bent"
						/>
						{/* Displacement samples whole pixels; a touch of bleed hides the steps. */}
						<feGaussianBlur in="bent" stdDeviation="0.45" />
					</filter>
				</svg>
			)}
		</>
	);
}
