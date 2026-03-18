import {
	adminQuery,
	authedQuery,
	optionalAuthQuery,
} from "../_lib/customFunctions";

export const getMyProfile = authedQuery({
	handler: async (ctx) => {
		return {
			_id: ctx.user._id,
			name: ctx.user.name,
			email: ctx.user.email,
			role: ctx.user.role ?? "member",
			pictureUrl: ctx.user.pictureUrl ?? null,
		};
	},
});

export const getMyProfileOrNull = optionalAuthQuery({
	handler: async (ctx) => {
		if (!ctx.user) return null;
		return {
			_id: ctx.user._id,
			name: ctx.user.name,
			email: ctx.user.email,
			role: ctx.user.role ?? "member",
			pictureUrl: ctx.user.pictureUrl ?? null,
		};
	},
});

export const listUsersAdminOnly = adminQuery({
	handler: async (ctx) => {
		const users = await ctx.db.query("users").collect();
		return users.map((u) => ({
			_id: u._id,
			name: u.name,
			email: u.email,
			role: u.role ?? "member",
		}));
	},
});
