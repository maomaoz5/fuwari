import { createSession, validateCredentials } from "@utils/admin/auth";
import type { APIRoute } from "astro";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
	try {
		const { username, password } = await request.json();
		if (!username || !password) {
			return new Response(JSON.stringify({ error: "请输入用户名和密码" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			});
		}
		if (!(await validateCredentials(username, password))) {
			return new Response(JSON.stringify({ error: "用户名或密码错误" }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			});
		}
		const token = createSession(username);
		return new Response(JSON.stringify({ success: true, token, username }), {
			headers: { "Content-Type": "application/json" },
		});
	} catch {
		return new Response(JSON.stringify({ error: "网络错误" }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		});
	}
};
