import { validatePasswordStrength } from "@utils/admin/security";
import { changePassword, consumeResetToken } from "@utils/admin/stats-db";
import type { APIRoute } from "astro";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
	try {
		const { token, newPassword } = await request.json();
		if (!token || !newPassword) {
			return new Response(JSON.stringify({ error: "缺少必要参数" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			});
		}

		// 验证 token
		const username = await consumeResetToken(token);
		if (!username) {
			return new Response(
				JSON.stringify({ success: false, message: "重置链接无效或已过期" }),
				{ status: 400, headers: { "Content-Type": "application/json" } },
			);
		}

		// 校验密码强度
		const passwordCheck = validatePasswordStrength(newPassword);
		if (!passwordCheck.valid) {
			return new Response(
				JSON.stringify({ success: false, message: passwordCheck.error }),
				{ status: 400, headers: { "Content-Type": "application/json" } },
			);
		}

		// 更新密码
		const changed = await changePassword(username, newPassword);
		if (!changed) {
			return new Response(
				JSON.stringify({ success: false, message: "密码更新失败，请重试" }),
				{ status: 500, headers: { "Content-Type": "application/json" } },
			);
		}

		return new Response(
			JSON.stringify({
				success: true,
				message: "密码重置成功，请使用新密码登录",
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
