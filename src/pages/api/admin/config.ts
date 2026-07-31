import { unauthorizedResponse, validateAuth } from "@utils/admin/auth";
import { getMergedConfig, writeOverrides } from "@utils/admin/config-store";
import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
	if (!validateAuth(request)) return unauthorizedResponse();

	try {
		const config = await getMergedConfig();
		return new Response(JSON.stringify(config), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	} catch (error) {
		return new Response(
			JSON.stringify({ error: "Failed to get config", details: String(error) }),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			},
		);
	}
};

export const PUT: APIRoute = async ({ request }) => {
	if (!validateAuth(request)) return unauthorizedResponse();

	try {
		const config = await request.json();
		writeOverrides(config);

		return new Response(JSON.stringify({ success: true }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	} catch (error) {
		return new Response(
			JSON.stringify({
				error: "Failed to update config",
				details: String(error),
			}),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			},
		);
	}
};
