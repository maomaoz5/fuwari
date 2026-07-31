import { unauthorizedResponse, validateAuth } from "@utils/admin/auth";
import { safeHandleError } from "@utils/admin/security";
import {
	changePassword,
	deleteAdmin,
	verifyAdmin,
} from "@utils/admin/stats-db";
import type { APIRoute } from "astro";

export const prerender = false;

export const PUT: APIRoute = async ({ request, params }) => {
	// 验证操作者身份
	const currentAuth = validateAuth(request);
	if (!currentAuth.valid || !currentAuth.username) {
		return unauthorizedResponse();
	}

	try {
		const username = params.username;
		if (!username) {
			return new Response(JSON.stringify({ error: "Missing username" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			});
		}

		const { newPassword, currentPassword } = await request.json();

		// SEC-15: 要求提供当前密码
		if (!currentPassword) {
			return new Response(
				JSON.stringify({ error: "Current password is required" }),
				{
					status: 400,
					headers: { "Content-Type": "application/json" },
				},
			);
		}

		// 验证当前密码是否正确
		const verified = await verifyAdmin(username, currentPassword);
		if (!verified) {
			return new Response(
				JSON.stringify({ error: "Current password is incorrect" }),
				{
					status: 403,
					headers: { "Content-Type": "application/json" },
				},
			);
		}

		if (!newPassword) {
			return new Response(
				JSON.stringify({ error: "New password is required" }),
				{
					status: 400,
					headers: { "Content-Type": "application/json" },
				},
			);
		}

		const success = await changePassword(username, newPassword);
		if (!success) {
			return new Response(JSON.stringify({ error: "Admin not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			});
		}

		return new Response(JSON.stringify({ success: true, username }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	} catch (error) {
		return safeHandleError(error, "PUT /api/admin/admins/[username]");
	}
};

export const DELETE: APIRoute = async ({ request, params }) => {
	// 验证操作者身份
	const currentAuth = validateAuth(request);
	if (!currentAuth.valid || !currentAuth.username) {
		return unauthorizedResponse();
	}

	try {
		const username = params.username;
		if (!username) {
			return new Response(JSON.stringify({ error: "Missing username" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			});
		}

		// SEC-16: 要求密码确认才能删除
		const { confirmPassword } = await request.json();

		if (!confirmPassword) {
			return new Response(
				JSON.stringify({ error: "Password confirmation is required" }),
				{
					status: 400,
					headers: { "Content-Type": "application/json" },
				},
			);
		}

		// 验证操作者的密码
		const verified = await verifyAdmin(currentAuth.username, confirmPassword);
		if (!verified) {
			return new Response(
				JSON.stringify({ error: "Password confirmation failed" }),
				{
					status: 403,
					headers: { "Content-Type": "application/json" },
				},
			);
		}

		const success = await deleteAdmin(username);
		if (!success) {
			return new Response(
				JSON.stringify({
					error: "Cannot delete admin (not found or is the last admin)",
				}),
				{
					status: 400,
					headers: { "Content-Type": "application/json" },
				},
			);
		}

		return new Response(JSON.stringify({ success: true, username }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	} catch (error) {
		return safeHandleError(error, "DELETE /api/admin/admins/[username]");
	}
};
