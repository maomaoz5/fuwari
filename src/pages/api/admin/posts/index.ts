import { unauthorizedResponse, validateAuth } from "@utils/admin/auth";
import { createPost, listPosts } from "@utils/admin/file-ops";
import {
	safeErrorResponse,
	safeHandleError,
	validateSlug,
} from "@utils/admin/security";
import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
	if (!validateAuth(request).valid) return unauthorizedResponse();

	try {
		const posts = listPosts();
		return new Response(JSON.stringify(posts), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	} catch (error) {
		return safeHandleError(error, "GET /api/admin/posts");
	}
};

export const POST: APIRoute = async ({ request }) => {
	if (!validateAuth(request).valid) return unauthorizedResponse();

	try {
		const body = await request.json();
		const { slug, title, content, frontmatter } = body;

		if (!slug || !title || content === undefined) {
			return safeErrorResponse(
				400,
				"Missing required fields: slug, title, content",
			);
		}

		if (!validateSlug(slug)) {
			return safeErrorResponse(400, "Invalid slug format");
		}

		const fm = frontmatter ?? {};
		createPost(slug, { title, ...fm }, content);

		return new Response(JSON.stringify({ success: true, slug }), {
			status: 201,
			headers: { "Content-Type": "application/json" },
		});
	} catch (error) {
		return safeHandleError(error, "POST /api/admin/posts");
	}
};
