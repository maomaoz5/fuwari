import { createMiddleware } from "hono/factory";
import { type AppEnv, fail } from "../http";
import { getTokenFromRequest, validateSession } from "../services/session";

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
	const token = getTokenFromRequest(c.req.raw);
	const username = token ? await validateSession(token) : null;
	if (!username) {
		return fail(c, 401, "unauthorized", "Unauthorized");
	}
	c.set("username", username);
	await next();
});
