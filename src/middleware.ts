import { defineMiddleware } from "astro:middleware";
import { siteConfig } from "@/config";
import { apiApp } from "@/server/app";

const normalizePath = (path: string) => path.replace(/\/$/, "") || "/";

export const onRequest = defineMiddleware(async (context, next) => {
	const url = new URL(context.request.url);
	const pathname = normalizePath(url.pathname);

	// spike:仅验证 Astro middleware → Hono 转发链路可行
	if (pathname === "/api/__health") {
		return apiApp.fetch(context.request);
	}

	const response = await next();
	response.headers.set("X-Content-Type-Options", "nosniff");
	response.headers.set("X-Frame-Options", "DENY");
	const contentType = response.headers.get("Content-Type") || "";
	if (contentType.includes("text/html")) {
		const html = await response.text();
		const hueStyle = `<style>:root{--hue:${siteConfig.themeColor.hue}}</style>`;
		const injected = html.replace("</head>", `${hueStyle}</head>`);
		return new Response(injected, {
			status: response.status,
			statusText: response.statusText,
			headers: response.headers,
		});
	}
	return response;
});
