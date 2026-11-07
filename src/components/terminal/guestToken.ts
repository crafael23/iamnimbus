/**
 * Guest access tokens from /api/guest. The guest id itself stays in an
 * httpOnly cookie this code never sees; the token is cached until a minute
 * before it expires, and concurrent callers share one request.
 */

type Issued = { token: string; expiresAt: number };

let cached: Issued | null = null;
let inflight: Promise<Issued> | null = null;

export async function guestToken(): Promise<string> {
	if (cached && cached.expiresAt - 60_000 > Date.now()) return cached.token;
	inflight ??= fetch("/api/guest", { method: "POST", credentials: "same-origin" })
		.then(async (res) => {
			if (!res.ok) throw new Error(`guest token: ${res.status}`);
			cached = (await res.json()) as Issued;
			return cached;
		})
		.finally(() => {
			inflight = null;
		});
	return (await inflight).token;
}
