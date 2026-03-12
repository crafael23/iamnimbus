import { query } from "./_generated/server";
import { getCurrentUser, getCurrentUserOrNull, requireAdmin } from "./lib/auth";

export const getMyProfile = query({
	args: {},
	handler: async (ctx) => {
		const user = await getCurrentUser(ctx);
		return {
			_id: user._id,
			name: user.name,
			email: user.email,
			role: user.role ?? "member",
			pictureUrl: user.pictureUrl ?? null,
		};
	},
});

export const getMyProfileOrNull = query({
	args: {},
	handler: async (ctx) => {
		const user = await getCurrentUserOrNull(ctx);
		if (!user) return null;
		return {
			_id: user._id,
			name: user.name,
			email: user.email,
			role: user.role ?? "member",
			pictureUrl: user.pictureUrl ?? null,
		};
	},
});

export const listUsersAdminOnly = query({
	args: {},
	handler: async (ctx) => {
		await requireAdmin(ctx);

		const users = await ctx.db.query("users").collect();
		return users.map((u) => ({
			_id: u._id,
			name: u.name,
			email: u.email,
			role: u.role ?? "member",
		}));
	},
});
