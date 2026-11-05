import { authkitMiddleware } from "@workos-inc/authkit-nextjs";

export default authkitMiddleware({
	middlewareAuth: {
		enabled: true,
		// Everything public except /admin. Admin data is also guarded in Convex.
		unauthenticatedPaths: [
			"/",
			"/sign-in",
			"/sign-up",
			"/blog",
			"/blog/:path*",
			"/projects",
			"/projects/:path*",
		],
	},
});

export const config = {
	matcher: [
		// Skip Next.js internals and all static files, unless found in search params
		"/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
		// Always run for API routes
		"/(api|trpc)(.*)",
	],
};
