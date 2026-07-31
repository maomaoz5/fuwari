import { unauthorizedResponse, validateAuth } from "@utils/admin/auth";
import { createPost, listPosts } from "@utils/admin/file-ops";
import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
	if (!validateAuth(request)) return unauthorizedResponse();

	try {
		const posts = listPosts();
		return new Response(JSON.stringify(posts), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	} catch (error) {
		return new Response(
			JSON.stringify({ error: "Failed to list posts", details: String(error) }),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			},
		);
	}
};

export const POST: APIRoute = async ({ request }) => {
	if (!validateAuth(request)) return unauthorizedResponse();

	try {
		const body = await request.json();
		const { slug, title, content, frontmatter } = body;

		if (!slug || !title || content === undefined) {
			return new Response(
				JSON.stringify({
					error: "Missing required fields: slug, title, content",
				}),
				{
					status: 400,
					headers: { "Content-Type": "application/json" },
				},
			);
		}

		const fm = frontmatter ?? {};
		createPost(slug, { title, ...fm }, content);

		return new Response(JSON.stringify({ success: true, slug }), {
			status: 201,
			headers: { "Content-Type": "application/json" },
		});
	} catch (error) {
		return new Response(
			JSON.stringify({
				error: "Failed to create post",
				details: String(error),
			}),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			},
		);
	}
};
