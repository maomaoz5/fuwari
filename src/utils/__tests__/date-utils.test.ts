import { describe, expect, it } from "vitest";
import { formatDateToYYYYMMDD } from "../date-utils";

describe("formatDateToYYYYMMDD", () => {
	it("formats a normal date correctly", () => {
		const date = new Date("2024-06-15T12:00:00Z");
		expect(formatDateToYYYYMMDD(date)).toBe("2024-06-15");
	});

	it("pads single-digit month and day with zero", () => {
		const date = new Date("2024-01-05T00:00:00Z");
		expect(formatDateToYYYYMMDD(date)).toBe("2024-01-05");
	});

	it("handles first day of year", () => {
		const date = new Date("2025-01-01T00:00:00Z");
		expect(formatDateToYYYYMMDD(date)).toBe("2025-01-01");
	});

	it("handles last day of year", () => {
		const date = new Date("2024-12-31T23:59:59Z");
		expect(formatDateToYYYYMMDD(date)).toBe("2024-12-31");
	});

	it("handles leap year date", () => {
		const date = new Date("2024-02-29T10:30:00Z");
		expect(formatDateToYYYYMMDD(date)).toBe("2024-02-29");
	});

	it("returns string in YYYY-MM-DD format", () => {
		const date = new Date("2023-11-22T08:00:00Z");
		const result = formatDateToYYYYMMDD(date);
		expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		expect(result).toBe("2023-11-22");
	});
});
