import { ConvexError } from "convex/values";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function assertSlug(slug: string) {
	if (!SLUG.test(slug) || slug.length > 96) {
		throw new ConvexError("Slug must be lowercase letters, numbers and single dashes");
	}
}
