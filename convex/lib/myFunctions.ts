import { query } from "../_generated/server";
import { getCurrentUserOrNull, requireAdmin } from "./auth";

export const publicGreeting = query({
	args: {},
	handler: async () => {
		return {
			role: "guest" as const,
			message: "Welcome, guest! Please sign in to see more.",
		};
	},
});

export const userGreeting = query({
	args: {},
	handler: async (ctx) => {
		const user = await getCurrentUserOrNull(ctx);
		return {
			role: (user?.role ?? "guest") as string,
			message: user
				? `Welcome back, ${user.name}!`
				: "Welcome! We couldn't load your profile yet.",
		};
	},
});

export const adminGreeting = query({
	args: {},
	handler: async (ctx) => {
		const admin = await requireAdmin(ctx);
		return {
			role: admin.role ?? "admin",
			message: `Admin dashboard for ${admin.name}`,
		};
	},
});

