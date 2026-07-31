import { unauthorizedResponse, validateAuth } from "@utils/admin/auth";
import { safeHandleError } from "@utils/admin/security";
import { getStats } from "@utils/admin/stats-db";
import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
	if (!validateAuth(request).valid) return unauthorizedResponse();

	try {
		const url = new URL(request.url);
		const rangeParam = url.searchParams.get("range") ?? "7d";
		const range = (
			["7d", "30d", "all"].includes(rangeParam) ? rangeParam : "7d"
		) as "7d" | "30d" | "all";

		const stats = await getStats(range);

		return new Response(JSON.stringify(stats), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	} catch (error) {
		return safeHandleError(error, "GET /api/admin/stats");
	}
};
