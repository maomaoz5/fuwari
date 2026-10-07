import crypto from "node:crypto";

export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
export const PBKDF2_ITERATIONS = 600_000;
export const PBKDF2_ITERATIONS_OLD = 10_000;
export const MIN_PASSWORD_LENGTH = 12;
export const RATE_LIMIT_MAX_ATTEMPTS = 10;
export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validateSlug(slug: string): boolean {
	if (slug.includes("..") || slug.includes("/") || slug.includes("\\")) {
		return false;
	}
	return SLUG_REGEX.test(slug);
}

export function validatePasswordStrength(password: string): {
	valid: boolean;
	error?: string;
} {
	if (password.length < MIN_PASSWORD_LENGTH) {
		return { valid: false, error: "密码长度至少为12个字符" };
	}
	return { valid: true };
}

export function hashPassword(
	password: string,
	salt?: string,
): { hash: string; salt: string } {
	const useSalt = salt || crypto.randomBytes(16).toString("hex");
	const hash = crypto
		.pbkdf2Sync(password, useSalt, PBKDF2_ITERATIONS, 64, "sha512")
		.toString("hex");
	return { hash, salt: useSalt };
}

export function verifyPassword(
	password: string,
	storedHash: string,
	salt: string,
): { valid: boolean; needsUpgrade: boolean } {
	const newHash = crypto
		.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 64, "sha512")
		.toString("hex");
	if (newHash === storedHash) return { valid: true, needsUpgrade: false };

	const oldHash = crypto
		.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS_OLD, 64, "sha512")
		.toString("hex");
	if (oldHash === storedHash) return { valid: true, needsUpgrade: true };

	return { valid: false, needsUpgrade: false };
}
