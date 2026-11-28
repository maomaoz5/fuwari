import { Resend } from "resend";

/**
 * 发信通道优先级：
 *   1. Cloudflare Email Service（REST）—— 生产环境使用
 *   2. Resend —— 兼容旧的本地/备用配置
 *   3. 都未配置时只打日志（开发环境，便于直接取重置链接）
 */

const CF_API_BASE = "https://api.cloudflare.com/client/v4";
const RESET_SUBJECT = "密码重置链接 - Fuwari Blog";

function buildBodies(resetUrl: string) {
	return {
		subject: RESET_SUBJECT,
		text: `请点击以下链接重置密码（30分钟内有效）：\n\n${resetUrl}\n\n如果你没有请求重置密码，请忽略此邮件。`,
		html: `<p>请点击以下链接重置密码（<strong>30分钟内有效</strong>）：</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>如果你没有请求重置密码，请忽略此邮件。</p>`,
	};
}

function senderAddress(): string {
	return (
		process.env.MAIL_FROM || process.env.SMTP_FROM || "noreply@maomaoz.org"
	);
}

/** Cloudflare Email Service 发信；未配置凭据返回 null 表示"本通道不可用" */
async function sendViaCloudflare(
	to: string,
	resetUrl: string,
): Promise<boolean | null> {
	const accountId = process.env.CF_ACCOUNT_ID;
	const token = process.env.CF_EMAIL_TOKEN;
	if (!accountId || !token) return null;

	const { subject, text, html } = buildBodies(resetUrl);

	try {
		const res = await fetch(
			`${CF_API_BASE}/accounts/${accountId}/email/sending/send`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					to,
					from: senderAddress(),
					subject,
					text,
					html,
				}),
				signal: AbortSignal.timeout(15000),
			},
		);

		const body = (await res.json().catch(() => ({}))) as {
			success?: boolean;
			errors?: unknown;
			result?: { message_id?: string };
		};

		if (!res.ok || body.success === false) {
			console.error(
				"[Email] Cloudflare send failed:",
				res.status,
				JSON.stringify(body.errors ?? body),
			);
			return false;
		}
		console.log(
			"[Email] sent via Cloudflare:",
			body.result?.message_id ?? "ok",
		);
		return true;
	} catch (error) {
		console.error("[Email] Cloudflare request error:", error);
		return false;
	}
}

/** Resend 备用通道；未配置 key 返回 null */
async function sendViaResend(
	to: string,
	resetUrl: string,
): Promise<boolean | null> {
	const apiKey = process.env.RESEND_API_KEY;
	if (!apiKey) return null;

	const { subject, text, html } = buildBodies(resetUrl);

	try {
		const resend = new Resend(apiKey);
		await resend.emails.send({
			from: senderAddress(),
			to,
			subject,
			text,
			html,
		});
		return true;
	} catch (error) {
		console.error("[Email] Resend send failed:", error);
		return false;
	}
}

export async function sendResetEmail(
	to: string,
	resetUrl: string,
): Promise<boolean> {
	// 1) Cloudflare
	const cf = await sendViaCloudflare(to, resetUrl);
	if (cf !== null) return cf;

	// 2) Resend
	const rs = await sendViaResend(to, resetUrl);
	if (rs !== null) return rs;

	// 3) 开发环境降级
	console.log(`[Password Reset] Reset link for ${to}: ${resetUrl}`);
	return true;
}
