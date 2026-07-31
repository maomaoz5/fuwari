import { unauthorizedResponse, validateAuth } from "@utils/admin/auth";
import { deletePost, readPost, writePost } from "@utils/admin/file-ops";
import {
	safeErrorResponse,
	safeHandleError,
	validateSlug,
} from "@utils/admin/security";
import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = async ({ request, params }) => {
	if (!validateAuth(request).valid) return unauthorizedResponse();

	const slug = params.slug as string;
	if (!validateSlug(slug)) {
		return safeErrorResponse(400, "Invalid slug format");
	}

	try {
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
		return safeHandleError(error, "GET /api/admin/posts/[slug]");
	}
};

export const PUT: APIRoute = async ({ request, params }) => {
	if (!validateAuth(request).valid) return unauthorizedResponse();

	const slug = params.slug as string;
	if (!validateSlug(slug)) {
		return safeErrorResponse(400, "Invalid slug format");
	}

	try {
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
		return safeHandleError(error, "PUT /api/admin/posts/[slug]");
	}
};

export const DELETE: APIRoute = async ({ request, params }) => {
	if (!validateAuth(request).valid) return unauthorizedResponse();

	const slug = params.slug as string;
	if (!validateSlug(slug)) {
		return safeErrorResponse(400, "Invalid slug format");
	}

	try {
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
		return safeHandleError(error, "DELETE /api/admin/posts/[slug]");
	}
};
