import { unauthorizedResponse, validateAuth } from "@utils/admin/auth";
import {
	safeHandleError,
	validatePasswordStrength,
} from "@utils/admin/security";
import { createAdmin, listAdmins } from "@utils/admin/stats-db";
import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
	if (!validateAuth(request).valid) return unauthorizedResponse();

	try {
		const admins = await listAdmins();
		return new Response(JSON.stringify(admins), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	} catch (error) {
		return safeHandleError(error, "GET /api/admin/admins");
	}
};

export const POST: APIRoute = async ({ request }) => {
	if (!validateAuth(request).valid) return unauthorizedResponse();

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

		const strengthCheck = validatePasswordStrength(password);
		if (!strengthCheck.valid) {
			return new Response(JSON.stringify({ error: strengthCheck.error }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			});
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
		return safeHandleError(error, "POST /api/admin/admins");
	}
};
