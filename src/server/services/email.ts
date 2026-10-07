import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
	? new Resend(process.env.RESEND_API_KEY)
	: null;

export async function sendResetEmail(
	to: string,
	resetUrl: string,
): Promise<boolean> {
	if (!resend) {
		// 降级：console.log 输出重置链接（开发环境）
		console.log(`[Password Reset] Reset link for ${to}: ${resetUrl}`);
		return true;
	}

	try {
		await resend.emails.send({
			from: process.env.SMTP_FROM || "onboarding@resend.dev",
			to,
			subject: "密码重置链接 - Fuwari Blog",
			text: `请点击以下链接重置密码（30分钟内有效）：\n\n${resetUrl}\n\n如果你没有请求重置密码，请忽略此邮件。`,
			html: `<p>请点击以下链接重置密码（<strong>30分钟内有效</strong>）：</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>如果你没有请求重置密码，请忽略此邮件。</p>`,
		});
		return true;
	} catch (error) {
		console.error("[Email] Failed to send reset email:", error);
		return false;
	}
}
