import { unauthorizedResponse, validateAuth } from "@utils/admin/auth";
import { changePassword, deleteAdmin } from "@utils/admin/stats-db";
import type { APIRoute } from "astro";

export const prerender = false;

export const PUT: APIRoute = async ({ request, params }) => {
	if (!validateAuth(request)) return unauthorizedResponse();

	try {
		const username = params.username;
		if (!username) {
			return new Response(JSON.stringify({ error: "Missing username" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			});
		}

		const body = await request.json();
		const { newPassword } = body;

		if (!newPassword || newPassword.length < 6) {
			return new Response(
				JSON.stringify({ error: "Password must be at least 6 characters" }),
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
		return new Response(
			JSON.stringify({
				error: "Failed to change password",
				details: String(error),
			}),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			},
		);
	}
};

export const DELETE: APIRoute = async ({ request, params }) => {
	if (!validateAuth(request)) return unauthorizedResponse();

	try {
		const username = params.username;
		if (!username) {
			return new Response(JSON.stringify({ error: "Missing username" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			});
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
		return new Response(
			JSON.stringify({
				error: "Failed to delete admin",
				details: String(error),
			}),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			},
		);
	}
};
