import type { APIRoute } from "astro";
import { getCaptchaConfig } from "@utils/admin/captcha";

export const prerender = false;

export const GET: APIRoute = async () => {
	const config = await getCaptchaConfig();
	return new Response(JSON.stringify(config), {
		headers: { "Content-Type": "application/json" },
	});
};
