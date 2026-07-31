import { unauthorizedResponse, validateAuth } from "@utils/admin/auth";
import { createAdmin, listAdmins } from "@utils/admin/stats-db";
import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
	if (!validateAuth(request)) return unauthorizedResponse();

	try {
		const admins = await listAdmins();
		return new Response(JSON.stringify(admins), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	} catch (error) {
		return new Response(
			JSON.stringify({
				error: "Failed to list admins",
				details: String(error),
			}),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			},
		);
	}
};

export const POST: APIRoute = async ({ request }) => {
	if (!validateAuth(request)) return unauthorizedResponse();

	try {
		const body = await request.json();
		const { username, password } = body;

		if (!username || !password) {
			return new Response(
				JSON.stringify({
					error: "Missing required fields: username, password",
				}),
				{
					status: 400,
					headers: { "Content-Type": "application/json" },
				},
			);
		}

		if (password.length < 6) {
			return new Response(
				JSON.stringify({ error: "Password must be at least 6 characters" }),
				{
					status: 400,
					headers: { "Content-Type": "application/json" },
				},
			);
		}

		const success = await createAdmin(username, password);
		if (!success) {
			return new Response(
				JSON.stringify({
					error: "Failed to create admin (username may already exist)",
				}),
				{
					status: 409,
					headers: { "Content-Type": "application/json" },
				},
			);
		}

		return new Response(JSON.stringify({ success: true, username }), {
			status: 201,
			headers: { "Content-Type": "application/json" },
		});
	} catch (error) {
		return new Response(
			JSON.stringify({
				error: "Failed to create admin",
				details: String(error),
			}),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			},
		);
	}
};
