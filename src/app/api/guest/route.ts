import { type NextRequest, NextResponse } from "next/server";
import {
	COOKIE_TTL_MS,
	GUEST_COOKIE,
	hashNetwork,
	networkPrefix,
	newGuestId,
	readGuestCookie,
	signGuestAccess,
	signGuestCookie,
} from "../../../../convex/_lib/guestToken";

/**
 * Issues the guest identity. The guest id lives in a signed httpOnly cookie
 * scoped to this route; the response is a one-hour access token for Convex
 * that also carries a keyed hash of the caller's network.
 *
 * The client address comes from x-forwarded-for, which the hosting platform
 * (Vercel) sets. Behind a proxy that passes the header through unchanged it
 * could be spoofed, which only moves a guest to another network's limit.
 */
export async function POST(request: NextRequest) {
	const secret = process.env.GUEST_TOKEN_SECRET;
	if (!secret) {
		return NextResponse.json({ error: "guest links are not configured" }, { status: 500 });
	}
	const now = Date.now();
	const sub =
		(await readGuestCookie(secret, request.cookies.get(GUEST_COOKIE)?.value, now)) ??
		newGuestId();

	const address =
		request.headers.get("x-forwarded-for")?.split(",")[0] ??
		request.headers.get("x-real-ip") ??
		"";
	const net = await hashNetwork(secret, networkPrefix(address));
	const { token, exp } = await signGuestAccess(secret, sub, net, now);

	const response = NextResponse.json(
		{ token, expiresAt: exp },
		{ headers: { "Cache-Control": "no-store" } },
	);
	// Re-signed on every call, so an active guest keeps the same id.
	response.cookies.set(GUEST_COOKIE, await signGuestCookie(secret, sub, now), {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "lax",
		path: "/api/guest",
		maxAge: COOKIE_TTL_MS / 1000,
	});
	return response;
}
