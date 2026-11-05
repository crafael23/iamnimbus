import { ConvexError, v } from "convex/values";
import { adminMutation } from "../_lib/customFunctions";

const MAX_PROMPT_LENGTH = 60_000;

/** Every save appends a version; the newest version is active. */
export const save = adminMutation({
	args: { content: v.string(), note: v.optional(v.string()) },
	handler: async (ctx, { content, note }) => {
		if (!content.trim()) throw new ConvexError("Prompt cannot be empty");
		if (content.length > MAX_PROMPT_LENGTH) {
			throw new ConvexError("Prompt is too long");
		}
		return await ctx.db.insert("systemPromptVersions", {
			content,
			note: note?.trim() || undefined,
			authorId: ctx.user._id,
		});
	},
});

/** Restoring copies an old version forward as a new, active version. */
export const restore = adminMutation({
	args: { versionId: v.id("systemPromptVersions") },
	handler: async (ctx, { versionId }) => {
		const version = await ctx.db.get(versionId);
		if (!version) throw new ConvexError("Version not found");
		return await ctx.db.insert("systemPromptVersions", {
			content: version.content,
			note: "Restored from an earlier version",
			authorId: ctx.user._id,
			restoredFrom: versionId,
		});
	},
});
