import {
	clearSessionCookie,
	createSession,
	setSessionCookie,
	validateCredentials,
} from "@utils/admin/auth";
import {
	createRateLimiter,
	RATE_LIMIT_MAX_ATTEMPTS,
	RATE_LIMIT_WINDOW_MS,
} from "@utils/admin/security";
import type { APIRoute } from "astro";

export const prerender = false;

const loginRateLimiter = createRateLimiter(
	RATE_LIMIT_MAX_ATTEMPTS,
	RATE_LIMIT_WINDOW_MS,
);

export const POST: APIRoute = async ({ request }) => {
	try {
		// 获取客户端 IP
		const clientIP =
			request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
			request.headers.get("x-real-ip") ||
			"unknown";

		const rateLimitResult = loginRateLimiter.check(clientIP);
		if (!rateLimitResult.allowed) {
			return new Response(
				JSON.stringify({
					error: "Too many login attempts",
					retryAfter: rateLimitResult.retryAfter,
				}),
				{ status: 429, headers: { "Content-Type": "application/json" } },
			);
		}

		const { username, password } = await request.json();
		if (!username || !password) {
			return new Response(JSON.stringify({ error: "请输入用户名和密码" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			});
		}
		if (!(await validateCredentials(username, password))) {
			const failHeaders = new Headers({ "Content-Type": "application/json" });
			clearSessionCookie(failHeaders);
			return new Response(JSON.stringify({ error: "用户名或密码错误" }), {
				status: 401,
				headers: failHeaders,
			});
		}
		const token = createSession(username);
		const headers = new Headers({ "Content-Type": "application/json" });
		setSessionCookie(headers, token);

		return new Response(JSON.stringify({ success: true, username }), {
			status: 200,
			headers,
		});
	} catch {
		return new Response(JSON.stringify({ error: "网络错误" }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		});
	}
};
