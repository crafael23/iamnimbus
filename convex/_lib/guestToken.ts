/**
 * Server-issued guest identity, shared by the Next route that issues it
 * (src/app/api/guest/route.ts) and the Convex functions that check it.
 *
 * Two HMAC-SHA256 signed tokens, both `<base64url payload>.<base64url mac>`:
 * - cookie ("c"): the long-lived guest id, kept in an httpOnly cookie that
 *   only the issuing route ever sees.
 * - access ("a"): a one-hour token the browser passes to Convex. It carries
 *   the guest id plus a keyed hash of the visitor's network (IPv4 /24 or
 *   IPv6 /64), so limits can follow the network when cookies are cleared.
 *
 * No Node or Convex imports: Web Crypto only, so both runtimes can use it.
 */

export const GUEST_COOKIE = "grid_guest";
export const COOKIE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const ACCESS_TTL_MS = 60 * 60 * 1000;

type CookiePayload = { k: "c"; sub: string; exp: number };
type AccessPayload = { k: "a"; sub: string; net: string; exp: number };
export type GuestAccess = { sub: string; net: string; exp: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
	let binary = "";
	for (const b of bytes) binary += String.fromCharCode(b);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
	if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
	try {
		const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
		return bytes;
	} catch {
		return null;
	}
}

async function hmacKey(secret: string) {
	if (secret.length < 32) {
		throw new Error("GUEST_TOKEN_SECRET must be at least 32 characters");
	}
	return await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
		"sign",
		"verify",
	]);
}

async function sign(secret: string, payload: CookiePayload | AccessPayload) {
	const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
	const mac = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(body));
	return `${body}.${toBase64Url(new Uint8Array(mac))}`;
}

async function open(secret: string, token: string): Promise<unknown> {
	const [body, mac, extra] = token.split(".");
	if (!body || !mac || extra !== undefined) return null;
	const macBytes = fromBase64Url(mac);
	const bodyBytes = fromBase64Url(body);
	if (!macBytes || !bodyBytes) return null;
	const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), macBytes, encoder.encode(body));
	if (!ok) return null;
	try {
		return JSON.parse(new TextDecoder().decode(bodyBytes));
	} catch {
		return null;
	}
}

export function newGuestId() {
	return crypto.randomUUID();
}

export async function signGuestCookie(secret: string, sub: string, now: number) {
	return await sign(secret, { k: "c", sub, exp: now + COOKIE_TTL_MS });
}

export async function signGuestAccess(secret: string, sub: string, net: string, now: number) {
	const exp = now + ACCESS_TTL_MS;
	return { token: await sign(secret, { k: "a", sub, net, exp }), exp };
}

/** The guest id in a valid, unexpired cookie token, else null. */
export async function readGuestCookie(secret: string, token: string | undefined, now: number): Promise<string | null> {
	if (!token) return null;
	const p = (await open(secret, token)) as Partial<CookiePayload> | null;
	if (p?.k !== "c" || typeof p.sub !== "string" || !UUID.test(p.sub)) return null;
	if (typeof p.exp !== "number" || p.exp <= now) return null;
	return p.sub;
}

/**
 * A signature-valid access token, or null. Expiry is checked by the caller,
 * because reads accept an older token than writes do.
 */
export async function readGuestAccess(secret: string, token: string): Promise<GuestAccess | null> {
	const p = (await open(secret, token)) as Partial<AccessPayload> | null;
	if (p?.k !== "a" || typeof p.sub !== "string" || !UUID.test(p.sub)) return null;
	if (typeof p.net !== "string" || !p.net || typeof p.exp !== "number") return null;
	return { sub: p.sub, net: p.net, exp: p.exp };
}

/**
 * The network an address belongs to: the /24 for IPv4 (including
 * IPv4-mapped IPv6), the /64 for IPv6. Unparseable input maps to itself.
 */
export function networkPrefix(address: string): string {
	const ip =
		address
			.trim()
			.toLowerCase()
			.replace(/^\[|\]$/g, "")
			.split("%")[0] ?? "";
	const v4 = ip.match(/^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/);
	if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}.0/24`;
	if (ip.includes(":")) {
		const [head = "", tail] = ip.split("::");
		const left = head ? head.split(":") : [];
		const right = tail ? tail.split(":") : [];
		const fill = tail === undefined ? [] : Array(Math.max(0, 8 - left.length - right.length)).fill("0");
		const groups = [...left, ...fill, ...right].map((g) => g.replace(/^0+(?=.)/, ""));
		return `${groups.slice(0, 4).join(":")}::/64`;
	}
	return ip || "unknown";
}

/** Keyed hash of a network prefix: stable per network, not reversible. */
export async function hashNetwork(secret: string, prefix: string) {
	const mac = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(`net:${prefix}`));
	return toBase64Url(new Uint8Array(mac).slice(0, 16));
}
