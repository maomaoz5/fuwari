import { unauthorizedResponse, validateAuth } from "@utils/admin/auth";
import { safeHandleError } from "@utils/admin/security";
import { setAdminEmail } from "@utils/admin/stats-db";
import type { APIRoute } from "astro";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
	const auth = validateAuth(request);
	if (!auth.valid || !auth.username) {
		return unauthorizedResponse();
	}

	try {
		const body = await request.json();
		const { email } = body;

		if (!email || typeof email !== "string") {
			return new Response(JSON.stringify({ error: "Email is required" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			});
		}

		// 简单邮箱格式校验
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(email.trim())) {
			return new Response(JSON.stringify({ error: "Invalid email format" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			});
		}

		const success = await setAdminEmail(auth.username, email.trim());
		if (!success) {
			return new Response(JSON.stringify({ error: "Admin not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			});
		}

		return new Response(
			JSON.stringify({ success: true, email: email.trim() }),
			{
				status: 200,
				headers: { "Content-Type": "application/json" },
			},
		);
	} catch (error) {
		return safeHandleError(error, "POST /api/admin/update-email");
	}
};
