import type { APIRoute } from "astro";
import { getSessionToken, validateSession } from "@/utils/admin/auth";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
	const token = getSessionToken(request);
	if (!token) {
		return new Response(JSON.stringify({ error: "Unauthorized" }), {
			status: 401,
			headers: { "Content-Type": "application/json" },
		});
	}

	const username = validateSession(token);
	if (!username) {
		return new Response(JSON.stringify({ error: "Session expired" }), {
			status: 401,
			headers: { "Content-Type": "application/json" },
		});
	}

	return new Response(JSON.stringify({ username }), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	});
};
