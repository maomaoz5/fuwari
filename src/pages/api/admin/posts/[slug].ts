import { unauthorizedResponse, validateAuth } from "@utils/admin/auth";
import { deletePost, readPost, writePost } from "@utils/admin/file-ops";
import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = async ({ request, params }) => {
	if (!validateAuth(request)) return unauthorizedResponse();

	try {
		const slug = params.slug as string;
		const post = readPost(slug);

		if (!post) {
			return new Response(JSON.stringify({ error: "Post not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			});
		}

		return new Response(JSON.stringify(post), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	} catch (error) {
		return new Response(
			JSON.stringify({ error: "Failed to read post", details: String(error) }),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			},
		);
	}
};

export const PUT: APIRoute = async ({ request, params }) => {
	if (!validateAuth(request)) return unauthorizedResponse();

	try {
		const slug = params.slug as string;
		const body = await request.json();
		const { content, frontmatter } = body;

		if (content === undefined || !frontmatter) {
			return new Response(
				JSON.stringify({
					error: "Missing required fields: content, frontmatter",
				}),
				{
					status: 400,
					headers: { "Content-Type": "application/json" },
				},
			);
		}

		writePost(slug, frontmatter, content);

		return new Response(JSON.stringify({ success: true, slug }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	} catch (error) {
		return new Response(
			JSON.stringify({
				error: "Failed to update post",
				details: String(error),
			}),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			},
		);
	}
};

export const DELETE: APIRoute = async ({ request, params }) => {
	if (!validateAuth(request)) return unauthorizedResponse();

	try {
		const slug = params.slug as string;
		const deleted = deletePost(slug);

		if (!deleted) {
			return new Response(JSON.stringify({ error: "Post not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			});
		}

		return new Response(JSON.stringify({ success: true, slug }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	} catch (error) {
		return new Response(
			JSON.stringify({
				error: "Failed to delete post",
				details: String(error),
			}),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			},
		);
	}
};
