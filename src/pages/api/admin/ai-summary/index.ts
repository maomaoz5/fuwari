import fs from "node:fs";
import path from "node:path";
import { unauthorizedResponse, validateAuth } from "@utils/admin/auth";
import { safeHandleError } from "@utils/admin/security";
import type { APIRoute } from "astro";

export const prerender = false;

const AI_SUMMARIES_DIR = path.join(process.cwd(), "public", "ai-summaries");

export const GET: APIRoute = async ({ request }) => {
	if (!validateAuth(request).valid) return unauthorizedResponse();

	try {
		if (!fs.existsSync(AI_SUMMARIES_DIR)) {
			return new Response(JSON.stringify([]), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}

		const files = fs
			.readdirSync(AI_SUMMARIES_DIR)
			.filter((f) => f.endsWith(".json"));
		const summaries = files.map((file) => {
			const slug = file.replace(/\.json$/, "");
			const filePath = path.join(AI_SUMMARIES_DIR, file);
			const stat = fs.statSync(filePath);
			return {
				slug,
				size: stat.size,
				modifiedAt: stat.mtime.toISOString(),
			};
		});

		return new Response(JSON.stringify(summaries), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	} catch (error) {
		return safeHandleError(error, "GET /api/admin/ai-summary");
	}
};
