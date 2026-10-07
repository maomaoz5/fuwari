import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../http";
import { fail, ok } from "../http";
import { requireAuth } from "../middleware/auth";
import {
	createPost,
	deletePost,
	listPosts,
	type PostFrontmatter,
	readPost,
	writePost,
} from "../services/post-files";
import { validateSlug } from "../services/security";

const CreatePostSchema = z.object({
	slug: z.string().min(1),
	title: z.string().min(1),
	content: z.string(),
	frontmatter: z.record(z.string(), z.unknown()).optional(),
});

const UpdatePostSchema = z.object({
	content: z.string(),
	frontmatter: z.record(z.string(), z.unknown()),
});

export const postsRoutes = new Hono<AppEnv>();

postsRoutes.get("/admin/posts", requireAuth, (c) => ok(c, listPosts()));

postsRoutes.post("/admin/posts", requireAuth, async (c) => {
	const parsed = CreatePostSchema.safeParse(
		await c.req.json().catch(() => null),
	);
	if (!parsed.success) {
		return fail(
			c,
			400,
			"invalid_request",
			"Missing required fields: slug, title, content",
		);
	}
	const { slug, title, content, frontmatter } = parsed.data;
	if (!validateSlug(slug)) {
		return fail(c, 400, "invalid_slug", "Invalid slug format");
	}
	try {
		createPost(
			slug,
			{ title, ...(frontmatter ?? {}) } as PostFrontmatter,
			content,
		);
	} catch (err) {
		if (err instanceof Error && err.message.includes("already exists")) {
			return fail(c, 409, "conflict", err.message);
		}
		throw err;
	}
	return c.json({ ok: true, data: { slug } }, 201);
});

postsRoutes.get("/admin/posts/:slug", requireAuth, (c) => {
	const slug = c.req.param("slug");
	if (!validateSlug(slug))
		return fail(c, 400, "invalid_slug", "Invalid slug format");
	const post = readPost(slug);
	if (!post) return fail(c, 404, "not_found", "Post not found");
	return ok(c, post);
});

postsRoutes.put("/admin/posts/:slug", requireAuth, async (c) => {
	const slug = c.req.param("slug");
	if (!validateSlug(slug))
		return fail(c, 400, "invalid_slug", "Invalid slug format");
	const parsed = UpdatePostSchema.safeParse(
		await c.req.json().catch(() => null),
	);
	if (!parsed.success) {
		return fail(
			c,
			400,
			"invalid_request",
			"Missing required fields: content, frontmatter",
		);
	}
	writePost(
		slug,
		parsed.data.frontmatter as unknown as PostFrontmatter,
		parsed.data.content,
	);
	return ok(c, { slug });
});

postsRoutes.delete("/admin/posts/:slug", requireAuth, (c) => {
	const slug = c.req.param("slug");
	if (!validateSlug(slug))
		return fail(c, 400, "invalid_slug", "Invalid slug format");
	const deleted = deletePost(slug);
	if (!deleted) return fail(c, 404, "not_found", "Post not found");
	return ok(c, { slug });
});
