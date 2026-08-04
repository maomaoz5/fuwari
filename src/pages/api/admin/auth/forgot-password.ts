import { sendResetEmail } from "@utils/admin/email";
import { createRateLimiter, RATE_LIMIT_WINDOW_MS } from "@utils/admin/security";
import { getAdminEmail, storeResetToken } from "@utils/admin/stats-db";
import type { APIRoute } from "astro";

export const prerender = false;

// 密码重置限速：每 15 分钟最多 3 次
const forgotPasswordRateLimiter = createRateLimiter(3, RATE_LIMIT_WINDOW_MS);

export const POST: APIRoute = async ({ request }) => {
	try {
		// 获取客户端 IP
		const clientIP =
			request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
			request.headers.get("x-real-ip") ||
			"unknown";

		const rateLimitResult = forgotPasswordRateLimiter.check(clientIP);
		if (!rateLimitResult.allowed) {
			return new Response(
				JSON.stringify({
					error: "请求过于频繁，请稍后再试",
					retryAfter: rateLimitResult.retryAfter,
				}),
				{ status: 429, headers: { "Content-Type": "application/json" } },
			);
		}

		const { username, turnstileToken } = await request.json();

		// Turnstile 验证码验证
		const turnstileSecretKey = process.env.TURNSTILE_SECRET_KEY;
		if (turnstileSecretKey) {
			const verifyRes = await fetch(
				"https://challenges.cloudflare.com/turnstile/v0/siteverify",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						secret: turnstileSecretKey,
						response: turnstileToken,
					}),
				},
			);
			const verifyData = await verifyRes.json();
			if (!verifyData.success) {
				return new Response(JSON.stringify({ error: "验证码验证失败" }), {
					status: 400,
					headers: { "Content-Type": "application/json" },
				});
			}
		}

		if (!username) {
			return new Response(JSON.stringify({ error: "请输入用户名" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			});
		}

		// 查找邮箱并发送重置邮件（无论结果如何返回相同消息）
		const email = await getAdminEmail(username);
		if (email) {
			const token = crypto.randomUUID();
			const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 分钟
			await storeResetToken(username, token, expiresAt);

			const siteUrl = process.env.SITE_URL || "http://localhost:4321";
			const resetUrl = `${siteUrl}/admin/reset-password/?token=${token}`;
			await sendResetEmail(email, resetUrl);
		}

		// 统一响应，防止用户名枚举攻击
		return new Response(
			JSON.stringify({
				success: true,
				message: "如果该用户名存在，重置链接已发送到注册邮箱",
			}),
			{ status: 200, headers: { "Content-Type": "application/json" } },
		);
	} catch {
		return new Response(JSON.stringify({ error: "网络错误" }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		});
	}
};
