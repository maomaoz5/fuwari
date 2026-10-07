import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import {
	hashPassword,
	verifyPassword,
	validateSlug,
	validatePasswordStrength,
	PBKDF2_ITERATIONS_OLD,
} from "./security";

describe("security", () => {
	it("hash and verify roundtrip", () => {
		const { hash, salt } = hashPassword("password123456");
		expect(verifyPassword("password123456", hash, salt)).toEqual({
			valid: true,
			needsUpgrade: false,
		});
		expect(verifyPassword("wrongpassword1", hash, salt).valid).toBe(false);
	});

	it("detects old-iteration hash and flags upgrade", () => {
		const salt = "aabbccdd";
		const legacyHash = crypto
			.pbkdf2Sync("password123456", salt, PBKDF2_ITERATIONS_OLD, 64, "sha512")
			.toString("hex");
		expect(verifyPassword("password123456", legacyHash, salt)).toEqual({
			valid: true,
			needsUpgrade: true,
		});
	});

	it("validates slugs", () => {
		expect(validateSlug("my-post-1")).toBe(true);
		expect(validateSlug("My_Post")).toBe(false);
		expect(validateSlug("a/b")).toBe(false);
		expect(validateSlug("..")).toBe(false);
		expect(validateSlug("a\\b")).toBe(false);
	});

	it("validates password strength", () => {
		expect(validatePasswordStrength("short").valid).toBe(false);
		expect(validatePasswordStrength("12charsmin123").valid).toBe(true);
	});
});
