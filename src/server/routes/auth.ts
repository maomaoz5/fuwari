import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../http";
import { fail, ok } from "../http";
import { requireAuth } from "../middleware/auth";
import {
	buildCaptchaInfo,
	CaptchaVerificationError,
	getCaptchaProvider,
	verifyCaptcha,
} from "../services/captcha";
import { sendResetEmail } from "../services/email";
import {
	changePassword,
	consumeResetToken,
	getAdminEmail,
	storeResetToken,
	verifyAdmin,
} from "../services/admins-repo";
import { checkRateLimit } from "../services/rate-limit";
import {
	RATE_LIMIT_MAX_ATTEMPTS,
	RATE_LIMIT_WINDOW_MS,
	validatePasswordStrength,
} from "../services/security";
import {
	clearSessionCookie,
	createSession,
	getClientIp,
	getTokenFromRequest,
	revokeSession,
	setSessionCookie,
} from "../services/session";

const LoginSchema = z.object({
	username: z.string().min(1),
	password: z.string().min(1),
	captchaToken: z.string().optional(),
});

const ForgotSchema = z.object({
	username: z.string().min(1),
	captchaToken: z.string().optional(),
});

const ResetSchema = z.object({
	token: z.string().min(1),
	newPassword: z.string().min(1),
});

async function verifyCaptchaOrThrow(token: string) {
	const provider = await getCaptchaProvider();
	if (provider === "none") return;
	try {
		const captchaInfo = await buildCaptchaInfo();
		await verifyCaptcha(token, { captchaInfo });
	} catch (err) {
		if (err instanceof CaptchaVerificationError) {
			return {
				status: 400 as const,
				payload: {
					code: "captcha_failed",
					message: err.message,
					captchaInfo: err.context.captchaInfo,
					captchaError: err.context.captchaError,
				},
			};
		}
		throw err;
	}
}

export const authRoutes = new Hono<AppEnv>();

authRoutes.post("/admin/auth", async (c) => {
	const ip = getClientIp(c.req.raw);
	const rl = await checkRateLimit(
		`login:${ip}`,
		RATE_LIMIT_MAX_ATTEMPTS,
		RATE_LIMIT_WINDOW_MS,
	);
	if (!rl.allowed) {
		return fail(c, 429, "rate_limited", "Too many login attempts", {
			retryAfter: rl.retryAfter,
		});
	}

	const parsed = LoginSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) {
		return fail(c, 400, "invalid_request", "请输入用户名和密码");
	}
	const { username, password, captchaToken } = parsed.data;

	const captchaError = await verifyCaptchaOrThrow(captchaToken ?? "");
	if (captchaError) {
		return c.json({ ok: false, error: captchaError.payload }, captchaError.status);
	}

	const valid = await verifyAdmin(username, password);
	if (!valid) {
		clearSessionCookie(c);
		return fail(c, 401, "invalid_credentials", "用户名或密码错误");
	}

	const token = await createSession(
		username,
		ip,
		c.req.header("User-Agent") ?? undefined,
	);
	setSessionCookie(c, token);
	return ok(c, { username });
});

authRoutes.post("/admin/auth/forgot-password", async (c) => {
	const ip = getClientIp(c.req.raw);
	const rl = await checkRateLimit(`forgot:${ip}`, 3, RATE_LIMIT_WINDOW_MS);
	if (!rl.allowed) {
		return fail(c, 429, "rate_limited", "请求过于频繁，请稍后再试", {
			retryAfter: rl.retryAfter,
		});
	}

	const parsed = ForgotSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) {
		return fail(c, 400, "invalid_request", "请输入用户名");
	}
	const { username, captchaToken } = parsed.data;

	const captchaError = await verifyCaptchaOrThrow(captchaToken ?? "");
	if (captchaError) {
		return c.json({ ok: false, error: captchaError.payload }, captchaError.status);
	}

	const email = await getAdminEmail(username);
	if (email) {
		const token = randomUUID();
		await storeResetToken(
			username,
			token,
			new Date(Date.now() + 30 * 60 * 1000),
		);
		const siteUrl = process.env.SITE_URL || "http://localhost:4321";
		await sendResetEmail(
			email,
			`${siteUrl}/admin/reset-password/?token=${token}`,
		);
	}

	return ok(c, { message: "如果该用户名存在，重置链接已发送到注册邮箱" });
});

authRoutes.post("/admin/auth/reset-password", async (c) => {
	const parsed = ResetSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) {
		return fail(c, 400, "invalid_request", "缺少必要参数");
	}
	const { token, newPassword } = parsed.data;

	const username = await consumeResetToken(token);
	if (!username) {
		return fail(c, 400, "invalid_token", "重置链接无效或已过期");
	}

	const strength = validatePasswordStrength(newPassword);
	if (!strength.valid) {
		return fail(c, 400, "weak_password", strength.error ?? "密码强度不足");
	}

	const changed = await changePassword(username, newPassword);
	if (!changed) {
		return fail(c, 500, "internal", "密码更新失败，请重试");
	}
	return ok(c, { message: "密码重置成功，请使用新密码登录" });
});

authRoutes.post("/admin/logout", async (c) => {
	const token = getTokenFromRequest(c.req.raw);
	if (token) await revokeSession(token);
	clearSessionCookie(c);
	return ok(c, { success: true });
});

authRoutes.get("/admin/me", requireAuth, (c) =>
	ok(c, { username: c.get("username") }),
);

authRoutes.get("/admin/captcha-config", async (c) =>
	ok(c, await buildCaptchaInfo()),
);
