import { defineMiddleware } from "astro:middleware";
import { getSessionToken, validateSession } from "@/utils/admin/auth";

// 不需要认证的路径
const PUBLIC_PATHS = new Set([
	"/admin/", // 登录页
	"/admin", // 登录页（无尾斜杠）
]);

const PUBLIC_API_PATHS = new Set([
	"/api/admin/auth", // 登录 API
]);

export const onRequest = defineMiddleware(async (context, next) => {
	const url = new URL(context.request.url);
	const pathname = url.pathname;

	// 检查是否需要认证
	const isAdminPage = pathname.startsWith("/admin/");
	const isAdminApi = pathname.startsWith("/api/admin/");

	if (!isAdminPage && !isAdminApi) {
		const response = await next();
		// 添加安全响应头
		response.headers.set("X-Content-Type-Options", "nosniff");
		response.headers.set("X-Frame-Options", "DENY");
		return response;
	}

	// 白名单路径直接放行
	if (PUBLIC_PATHS.has(pathname) || PUBLIC_API_PATHS.has(pathname)) {
		const response = await next();
		response.headers.set("X-Content-Type-Options", "nosniff");
		response.headers.set("X-Frame-Options", "DENY");
		return response;
	}

	// 验证 session
	const token = getSessionToken(context.request);
	const username = token ? validateSession(token) : null;

	if (!username) {
		// API 请求返回 401 JSON
		if (isAdminApi) {
			return new Response(JSON.stringify({ error: "Unauthorized" }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			});
		}
		// 页面请求重定向到登录页
		return context.redirect("/admin/");
	}

	// 将用户名附加到 locals 供后续使用
	context.locals.username = username;

	const response = await next();
	response.headers.set("X-Content-Type-Options", "nosniff");
	response.headers.set("X-Frame-Options", "DENY");
	return response;
});
