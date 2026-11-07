/** Barrel strength: a corner moves inward by CURVE / 4 of the screen's size. */
export const CRT_CURVE = 0.1;

/** Wide screens with a fine pointer get the curve; touch devices stay flat. */
export const CURVE_QUERY = "(min-width: 768px) and (pointer: fine)";

/** Safari renders the SVG displacement filter poorly, so it keeps a flat screen. */
export function isWebkit() {
	const ua = navigator.userAgent;
	return /iP(hone|ad|od)/.test(ua) || (/Safari\//.test(ua) && !/Chrome|Chromium|Edg\//.test(ua));
}

/** The curve the site's tube has right now, for anything drawn to match it (0 when flat). */
export function crtCurve() {
	return !isWebkit() && window.matchMedia(CURVE_QUERY).matches ? CRT_CURVE : 0;
}
