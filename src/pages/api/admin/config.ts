import { unauthorizedResponse, validateAuth } from "@utils/admin/auth";
import { getMergedConfig, writeOverrides } from "@utils/admin/config-store";
import { safeHandleError } from "@utils/admin/security";
import type { APIRoute } from "astro";

// 允许的配置顶层 key 白名单
const ALLOWED_CONFIG_KEYS = new Set([
	"site",
	"navBar",
	"profile",
	"license",
	"expressiveCode",
	"aiSummary",
	"captcha",
]);

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
	if (!validateAuth(request).valid) return unauthorizedResponse();

	try {
		const config = await getMergedConfig();
		return new Response(JSON.stringify(config), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	} catch (error) {
		return safeHandleError(error, "GET config");
	}
};

export const PUT: APIRoute = async ({ request }) => {
	if (!validateAuth(request).valid) return unauthorizedResponse();

	try {
		const body = await request.json();

		// 验证用户提交的 key 白名单
		const unknownKeys = Object.keys(body).filter(
			(key) => !ALLOWED_CONFIG_KEYS.has(key),
		);
		if (unknownKeys.length > 0) {
			return new Response(
				JSON.stringify({
					error: `Unknown config keys: ${unknownKeys.join(", ")}`,
				}),
				{ status: 400, headers: { "Content-Type": "application/json" } },
			);
		}

		writeOverrides(body);

		return new Response(JSON.stringify({ success: true }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	} catch (error) {
		return safeHandleError(error, "PUT config");
	}
};
