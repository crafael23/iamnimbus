import { ConvexError } from "convex/values";

export function errorMessage(error: unknown) {
	if (error instanceof ConvexError) {
		return typeof error.data === "string" ? error.data : JSON.stringify(error.data);
	}
	return error instanceof Error ? error.message : "Something went wrong";
}

export function slugify(title: string) {
	return title
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80);
}

export function formatTime(ms: number) {
	return new Date(ms).toLocaleString("en-US", {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}
