import { query } from "../_generated/server";
import {
	adminQuery,
	optionalAuthQuery,
} from "../_lib/customFunctions";

export const publicGreeting = query({
	args: {},
	handler: async () => {
		return {
			role: "guest" as const,
			message: "Welcome, guest! Please sign in to see more.",
		};
	},
});

export const userGreeting = optionalAuthQuery({
	handler: async (ctx) => {
		return {
			role: (ctx.user?.role ?? "guest") as string,
			message: ctx.user
				? `Welcome back, ${ctx.user.name}!`
				: "Welcome! We couldn't load your profile yet.",
		};
	},
});

export const adminGreeting = adminQuery({
	handler: async (ctx) => {
		return {
			role: ctx.user.role ?? "admin",
			message: `Admin dashboard for ${ctx.user.name}`,
		};
	},
});
