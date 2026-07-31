// ─── 常量 ────────────────────────────────────────────────────────────────────

export const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 小时
export const PBKDF2_ITERATIONS = 600_000;
export const PBKDF2_ITERATIONS_OLD = 10_000; // 用于透明升级
export const MIN_PASSWORD_LENGTH = 12;
export const RATE_LIMIT_MAX_ATTEMPTS = 10;
export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 分钟

// ─── validateSlug ─────────────────────────────────────────────────────────────

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validateSlug(slug: string): boolean {
	if (slug.includes("..") || slug.includes("/") || slug.includes("\\")) {
		return false;
	}
	return SLUG_REGEX.test(slug);
}

// ─── validatePasswordStrength ─────────────────────────────────────────────────

export function validatePasswordStrength(password: string): {
	valid: boolean;
	error?: string;
} {
	if (password.length < MIN_PASSWORD_LENGTH) {
		return { valid: false, error: "密码长度至少为12个字符" };
	}
	return { valid: true };
}

// ─── createRateLimiter ────────────────────────────────────────────────────────

export function createRateLimiter(maxAttempts: number, windowMs: number) {
	const store = new Map<string, number[]>();

	return {
		check(key: string): { allowed: boolean; retryAfter?: number } {
			const now = Date.now();
			let timestamps = store.get(key) ?? [];

			// 移除窗口外的时间戳
			timestamps = timestamps.filter((ts) => now - ts <= windowMs);

			if (timestamps.length >= maxAttempts) {
				const oldestTimestamp = timestamps[0];
				const retryAfter = Math.ceil(
					(windowMs - (now - oldestTimestamp)) / 1000,
				);
				store.set(key, timestamps);
				return { allowed: false, retryAfter };
			}

			timestamps.push(now);
			store.set(key, timestamps);
			return { allowed: true };
		},
	};
}

// ─── safeErrorResponse ────────────────────────────────────────────────────────

export function safeErrorResponse(status: number, message: string): Response {
	return new Response(JSON.stringify({ error: message }), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

// ─── safeHandleError ──────────────────────────────────────────────────────────

export function safeHandleError(error: unknown, logPrefix: string): Response {
	console.error(`[${logPrefix}]`, error);
	return safeErrorResponse(500, "Internal server error");
}
