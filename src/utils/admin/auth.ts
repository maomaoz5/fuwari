import { randomUUID } from "node:crypto";
import { SESSION_TTL_MS } from "./security";
import { verifyAdmin } from "./stats-db";

// 验证用户名+密码（通过 SQLite 数据库）
export async function validateCredentials(
	username: string,
	password: string,
): Promise<boolean> {
	return verifyAdmin(username, password);
}

// 使用 crypto.randomUUID 生成安全的 session token
export function generateSessionToken(): string {
	return randomUUID();
}

// 使用内存存储活跃的 session
const activeSessions = new Map<
	string,
	{ username: string; createdAt: number }
>();

function cleanupExpiredSessions(): void {
	const now = Date.now();
	for (const [token, session] of activeSessions) {
		if (now - session.createdAt > SESSION_TTL_MS) {
			activeSessions.delete(token);
		}
	}
}

export function createSession(username: string): string {
	cleanupExpiredSessions();
	const token = generateSessionToken();
	activeSessions.set(token, { username, createdAt: Date.now() });
	return token;
}

export function validateSession(token: string): string | null {
	const session = activeSessions.get(token);
	if (!session) return null;

	if (Date.now() - session.createdAt > SESSION_TTL_MS) {
		activeSessions.delete(token);
		return null;
	}

	return session.username;
}

// Cookie 辅助函数
const SESSION_COOKIE_NAME = "fuwari_session";

export function setSessionCookie(headers: Headers, token: string): void {
	const isDev = typeof import.meta !== "undefined" && import.meta.env?.DEV;
	const secureFlag = isDev ? "" : " Secure;";
	headers.append(
		"Set-Cookie",
		`${SESSION_COOKIE_NAME}=${token}; HttpOnly;${secureFlag} SameSite=Strict; Path=/; Max-Age=86400`,
	);
}

export function getSessionToken(request: Request): string | null {
	const cookieHeader = request.headers.get("cookie");
	if (!cookieHeader) return null;
	const match = cookieHeader.match(
		new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`),
	);
	return match ? match[1] : null;
}

export function clearSessionCookie(headers: Headers): void {
	const isDev = typeof import.meta !== "undefined" && import.meta.env?.DEV;
	const secureFlag = isDev ? "" : " Secure;";
	headers.append(
		"Set-Cookie",
		`${SESSION_COOKIE_NAME}=; HttpOnly;${secureFlag} SameSite=Strict; Path=/; Max-Age=0`,
	);
}

// 验证 API 请求：优先 Cookie，向后兼容 Bearer token
export function validateAuth(request: Request): {
	valid: boolean;
	username?: string;
} {
	let token = getSessionToken(request);
	if (!token) {
		const authHeader = request.headers.get("Authorization");
		if (authHeader?.startsWith("Bearer ")) {
			token = authHeader.substring(7);
		}
	}
	if (!token) return { valid: false };
	const username = validateSession(token);
	return username ? { valid: true, username } : { valid: false };
}

export function clearSession(token: string): void {
	activeSessions.delete(token);
}

export function unauthorizedResponse(): Response {
	return new Response(JSON.stringify({ error: "Unauthorized" }), {
		status: 401,
		headers: { "Content-Type": "application/json" },
	});
}
