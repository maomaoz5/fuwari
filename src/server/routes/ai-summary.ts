import fs from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import type { AppEnv } from "../http";
import { fail, ok } from "../http";
import { requireAuth } from "../middleware/auth";
import { validateSlug } from "../services/security";

function getSummariesDir(): string {
	return (
		process.env.AI_SUMMARIES_DIR ||
		path.join(process.cwd(), "public", "ai-summaries")
	);
}

export const aiSummaryRoutes = new Hono<AppEnv>();

aiSummaryRoutes.get("/admin/ai-summary", requireAuth, (c) => {
	const dir = getSummariesDir();
	if (!fs.existsSync(dir)) return ok(c, []);
	const summaries = fs
		.readdirSync(dir)
		.filter((f) => f.endsWith(".json"))
		.map((file) => {
			const stat = fs.statSync(path.join(dir, file));
			return {
				slug: file.replace(/\.json$/, ""),
				size: stat.size,
				modifiedAt: stat.mtime.toISOString(),
			};
		});
	return ok(c, summaries);
});

aiSummaryRoutes.delete("/admin/ai-summary/:slug", requireAuth, (c) => {
	const slug = c.req.param("slug");
	if (!validateSlug(slug)) return fail(c, 400, "invalid_slug", "Invalid slug format");
	const filePath = path.join(getSummariesDir(), `${slug}.json`);
	if (!fs.existsSync(filePath)) {
		return fail(c, 404, "not_found", "AI summary not found");
	}
	fs.unlinkSync(filePath);
	return ok(c, { slug });
});

aiSummaryRoutes.post("/admin/ai-summary/:slug", requireAuth, (c) => {
	return c.json(
		{ ok: false, error: { code: "not_implemented", message: "not implemented" } },
		501,
	);
});
