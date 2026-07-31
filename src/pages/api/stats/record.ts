import { recordArticleView, recordVisit } from "@utils/admin/stats-db";
import type { APIRoute } from "astro";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
	try {
		const { type, slug, path } = await request.json();
		if (type === "article" && slug) {
			await recordArticleView(slug);
			await recordVisit(`/posts/${slug}`);
		} else {
			await recordVisit(path || "/");
		}
		return new Response(JSON.stringify({ success: true }), {
			headers: { "Content-Type": "application/json" },
		});
	} catch {
		return new Response(JSON.stringify({ error: "Failed to record" }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		});
	}
};
