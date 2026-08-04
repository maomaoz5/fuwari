import {
	clearSessionCookie,
	createSession,
	setSessionCookie,
	validateCredentials,
} from "@utils/admin/auth";
import {
	buildCaptchaInfo,
	CaptchaVerificationError,
	getCaptchaProvider,
	getCaptchaSecretKey,
	verifyCaptcha,
} from "@utils/admin/captcha";
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

		const { username, password, captchaToken } = await request.json();
		if (!username || !password) {
			return new Response(JSON.stringify({ error: "请输入用户名和密码" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			});
		}

		// 验证码验证（支持 turnstile / hcaptcha，由后端配置决定）
		const captchaProvider = await getCaptchaProvider();
		if (captchaProvider !== "none") {
			try {
				const captchaInfo = await buildCaptchaInfo();
				const context = { captchaInfo };
				await verifyCaptcha(captchaToken || "", context);
			} catch (err) {
				if (err instanceof CaptchaVerificationError) {
					const secretKey = await getCaptchaSecretKey();
					console.warn(
						"[auth] 验证码验证失败",
						`provider=${captchaProvider}`,
						`hasSecretKey=${!!secretKey}`,
						`hasToken=${!!captchaToken}`,
						`errorType=${err.type}`,
					);
					return new Response(
						JSON.stringify({
							error: err.message,
							captchaInfo: err.context.captchaInfo,
							captchaError: err.context.captchaError,
						}),
						{
							status: 400,
							headers: { "Content-Type": "application/json" },
						},
					);
				}
				throw err;
			}
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
