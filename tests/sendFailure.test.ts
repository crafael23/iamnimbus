import { ConvexError } from "convex/values";
import { describe, expect, test } from "vitest";
import { sendFailure } from "../src/components/terminal/sendFailure";

describe("sendFailure", () => {
	test("guest limits open the gate and drop the text", () => {
		expect(sendFailure(new ConvexError({ code: "GUEST_LIMIT" }), "guest")).toEqual({
			gate: "GUEST_LIMIT",
			restore: false,
		});
		expect(sendFailure(new ConvexError({ code: "NETWORK_LIMIT" }), "guest").gate).toBe("NETWORK_LIMIT");
	});

	test("capacity speaks to the tier", () => {
		expect(sendFailure(new ConvexError({ code: "CAPACITY" }), "guest").line?.text).toMatch(/guest links/);
		expect(sendFailure(new ConvexError({ code: "CAPACITY" }), "registered").line?.text).not.toMatch(/guest/);
	});

	test("budget names the day or the month, and keeps the text", () => {
		const day = sendFailure(new ConvexError({ code: "BUDGET", scope: "day" }), "registered");
		expect(day.line?.text).toMatch(/tomorrow/);
		expect(day.restore).toBe(true);
		expect(sendFailure(new ConvexError({ code: "BUDGET", scope: "month" }), "guest").line?.text).toMatch(/1st/);
	});

	test("anything else is a connection error and keeps the text", () => {
		const outcome = sendFailure(new Error("offline"), "guest");
		expect(outcome).toMatchObject({ line: { kind: "error" }, restore: true });
		expect(outcome.gate).toBeUndefined();
	});
});
