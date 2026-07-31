import {
	clearSession,
	clearSessionCookie,
	getSessionToken,
} from "@utils/admin/auth";
import type { APIRoute } from "astro";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
	const token = getSessionToken(request);
	if (token) {
		clearSession(token);
	}

	const headers = new Headers({ "Content-Type": "application/json" });
	clearSessionCookie(headers);

	return new Response(JSON.stringify({ success: true }), {
		status: 200,
		headers,
	});
};
