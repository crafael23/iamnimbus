import { ConvexError } from "convex/values";

export type Tier = "guest" | "registered" | (string & {});

/** What the terminal does when a message could not be sent. */
export type SendFailure = {
	/** The guest gate to show instead of a line. */
	gate?: "GUEST_LIMIT" | "NETWORK_LIMIT";
	line?: { kind: "notice" | "error"; text: string };
	/** Put the message back in the box so it can be sent again. */
	restore: boolean;
};

/** Tell the visitor why a message did not send, and what to do about it. */
export function sendFailure(error: unknown, tier: Tier): SendFailure {
	const data = error instanceof ConvexError ? (error.data as { code?: string; scope?: string }) : {};
	switch (data.code) {
		case "GUEST_LIMIT":
		case "NETWORK_LIMIT":
			return { gate: data.code, restore: false };
		case "DAILY_LIMIT":
			return {
				line: {
					kind: "notice",
					text: "You have used today's 30 messages. The channel reopens as the 24-hour window rolls forward.",
				},
				restore: false,
			};
		case "CAPACITY":
			return {
				line: {
					kind: "notice",
					text:
						tier === "guest"
							? "The grid is at capacity for guest links right now. Sign in, or try again in a few minutes."
							: "The grid is at capacity right now. Try again a little later.",
				},
				restore: false,
			};
		case "BUSY":
			return {
				line: { kind: "notice", text: "Still answering the last message. Send this when it finishes." },
				restore: true,
			};
		case "BUDGET":
			return {
				line: {
					kind: "notice",
					text:
						data.scope === "day"
							? "The terminal has used today's power budget and is resting until tomorrow (UTC). Projects and writing are still open."
							: "The terminal has used this month's power budget and is resting until the 1st. Projects and writing are still open.",
				},
				restore: true,
			};
		case "TOO_LONG":
			return {
				line: { kind: "error", text: "That message is over 2,000 characters. Trim it and send again." },
				restore: true,
			};
		default:
			return {
				line: { kind: "error", text: "The message did not go through. Check your connection and send it again." },
				restore: true,
			};
	}
}
