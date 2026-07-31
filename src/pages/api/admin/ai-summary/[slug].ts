import fs from "node:fs";
import path from "node:path";
import { unauthorizedResponse, validateAuth } from "@utils/admin/auth";
import {
	safeErrorResponse,
	safeHandleError,
	validateSlug,
} from "@utils/admin/security";
import type { APIRoute } from "astro";

export const prerender = false;

const AI_SUMMARIES_DIR = path.join(process.cwd(), "public", "ai-summaries");

export const DELETE: APIRoute = async ({ request, params }) => {
	if (!validateAuth(request).valid) return unauthorizedResponse();

	const slug = params.slug as string;
	if (!validateSlug(slug)) {
		return safeErrorResponse(400, "Invalid slug format");
	}

	try {
		const filePath = path.join(AI_SUMMARIES_DIR, `${slug}.json`);

		if (!fs.existsSync(filePath)) {
			return new Response(JSON.stringify({ error: "AI summary not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			});
		}

		fs.unlinkSync(filePath);

		return new Response(JSON.stringify({ success: true, slug }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	} catch (error) {
		return safeHandleError(error, "DELETE /api/admin/ai-summary/[slug]");
	}
};

export const POST: APIRoute = async ({ request }) => {
	if (!validateAuth(request).valid) return unauthorizedResponse();

	return new Response(JSON.stringify({ error: "not implemented" }), {
		status: 501,
		headers: { "Content-Type": "application/json" },
	});
};
