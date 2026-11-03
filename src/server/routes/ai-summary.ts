import { Hono } from "hono";
import type { AppEnv } from "../http";
import { fail, ok } from "../http";
import { requireAuth } from "../middleware/auth";
import {
	AiSummaryError,
	deleteSummary,
	listSummaries,
	regenerateSummary,
} from "../services/ai-summary";
import { checkRateLimit } from "../services/rate-limit";
import { RATE_LIMIT_WINDOW_MS, validateSlug } from "../services/security";

/** 单账号 15 分钟内最多触发生成 10 次，避免刷爆 provider 配额 */
const REGENERATE_MAX_PER_WINDOW = 10;

export const aiSummaryRoutes = new Hono<AppEnv>();

aiSummaryRoutes.get("/admin/ai-summary", requireAuth, (c) =>
	ok(c, listSummaries()),
);

aiSummaryRoutes.delete("/admin/ai-summary/:slug", requireAuth, (c) => {
	const slug = c.req.param("slug");
	if (!validateSlug(slug))
		return fail(c, 400, "invalid_slug", "Invalid slug format");
	if (!deleteSummary(slug)) return fail(c, 404, "not_found", "AI summary not found");
	return ok(c, { slug });
});

aiSummaryRoutes.post("/admin/ai-summary/:slug", requireAuth, async (c) => {
	const slug = c.req.param("slug");
	if (!validateSlug(slug))
		return fail(c, 400, "invalid_slug", "Invalid slug format");

	const username = c.get("username");
	const rl = await checkRateLimit(
		`ai-regenerate:${username}`,
		REGENERATE_MAX_PER_WINDOW,
		RATE_LIMIT_WINDOW_MS,
	);
	if (!rl.allowed) {
		return fail(c, 429, "rate_limited", "操作过于频繁，请稍后再试", {
			retryAfter: rl.retryAfter,
		});
	}

	try {
		return ok(c, await regenerateSummary(slug));
	} catch (err) {
		if (err instanceof AiSummaryError) {
			switch (err.code) {
				case "not_found":
					return fail(c, 404, err.code, err.message);
				case "disabled":
				case "missing_api_key":
					return fail(c, 400, err.code, err.message);
				default:
					return fail(c, 502, err.code, err.message);
			}
		}
		throw err;
	}
});
