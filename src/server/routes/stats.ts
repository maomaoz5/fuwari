import { Hono } from "hono";
import type { AppEnv } from "../http";
import { ok } from "../http";
import { requireAuth } from "../middleware/auth";
import { checkRateLimit } from "../services/rate-limit";
import { RATE_LIMIT_WINDOW_MS } from "../services/security";
import { getClientIp } from "../services/session";
import {
	getStats,
	recordArticleView,
	recordVisit,
	type StatsRange,
} from "../services/stats-repo";

const STATS_RECORD_MAX = 60;

export const statsRoutes = new Hono<AppEnv>();

statsRoutes.get("/admin/stats", requireAuth, async (c) => {
	const raw = c.req.query("range") ?? "7d";
	const range = (["7d", "30d", "all"].includes(raw) ? raw : "7d") as StatsRange;
	return ok(c, await getStats(range));
});

statsRoutes.post("/stats/record", async (c) => {
	const ip = getClientIp(c.req.raw);
	const rl = await checkRateLimit(
		`stats-record:${ip}`,
		STATS_RECORD_MAX,
		RATE_LIMIT_WINDOW_MS,
	);
	if (!rl.allowed) {
		return c.json({ error: "Too many requests" }, 429);
	}
	const body = (await c.req.json().catch(() => null)) as {
		type?: string;
		slug?: unknown;
		path?: unknown;
	} | null;
	const slug = typeof body?.slug === "string" ? body.slug : "";
	const pagePath = typeof body?.path === "string" ? body.path : "/";
	if (body?.type === "article" && slug) {
		await recordArticleView(slug);
		await recordVisit(`/posts/${slug}`);
	} else {
		await recordVisit(pagePath || "/");
	}
	// 兼容博客前端的旧响应格式
	return c.json({ success: true });
});
