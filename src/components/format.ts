/** A calendar date as the site prints it, e.g. Mar 11, 2026 (UTC). */
export function formatDate(ms: number) {
	return new Date(ms).toLocaleDateString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
		timeZone: "UTC",
	});
}
