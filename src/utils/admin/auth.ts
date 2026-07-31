import { verifyAdmin } from "./stats-db";

// 验证用户名+密码（通过 SQLite 数据库）
export async function validateCredentials(
	username: string,
	password: string,
): Promise<boolean> {
	return verifyAdmin(username, password);
}

// 生成一个简单的 session token（用 crypto 随机生成）
export function generateSessionToken(): string {
	// 用简单的方式生成随机 token
	return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// 使用内存存储活跃的 session
const activeSessions = new Map<
	string,
	{ username: string; createdAt: number }
>();

export function createSession(username: string): string {
	const token = generateSessionToken();
	activeSessions.set(token, { username, createdAt: Date.now() });
	return token;
}

export function validateSession(token: string): boolean {
	return activeSessions.has(token);
}

// 保留原有的 validateAuth 用于 API 请求验证（检查 session token）
export function validateAuth(request: Request): boolean {
	const authHeader = request.headers.get("Authorization");
	if (!authHeader?.startsWith("Bearer ")) return false;
	const token = authHeader.slice(7);
	return validateSession(token);
}

export function unauthorizedResponse(): Response {
	return new Response(JSON.stringify({ error: "Unauthorized" }), {
		status: 401,
		headers: { "Content-Type": "application/json" },
	});
}
