import { Hono } from "hono";
import type { AppEnv } from "../http";
import { fail, ok } from "../http";
import { requireAuth } from "../middleware/auth";
import { getMergedConfig, writeOverrides } from "../services/config-store";

const ALLOWED_CONFIG_KEYS = new Set([
	"site",
	"navBar",
	"profile",
	"license",
	"expressiveCode",
	"aiSummary",
	"captcha",
]);

export const configRoutes = new Hono<AppEnv>();

configRoutes.get("/admin/config", requireAuth, async (c) =>
	ok(c, await getMergedConfig()),
);

configRoutes.put("/admin/config", requireAuth, async (c) => {
	const body: unknown = await c.req.json().catch(() => null);
	if (!body || typeof body !== "object" || Array.isArray(body)) {
		return fail(c, 400, "invalid_request", "Invalid config body");
	}
	const unknownKeys = Object.keys(body).filter(
		(key) => !ALLOWED_CONFIG_KEYS.has(key),
	);
	if (unknownKeys.length > 0) {
		return fail(
			c,
			400,
			"invalid_request",
			`Unknown config keys: ${unknownKeys.join(", ")}`,
		);
	}
	writeOverrides(body as Record<string, unknown>);
	return ok(c, { success: true });
});
