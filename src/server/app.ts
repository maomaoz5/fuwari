import { Hono } from "hono";
import { aiSummaryRoutes } from "./routes/ai-summary";
import { authRoutes } from "./routes/auth";
import { postsRoutes } from "./routes/posts";
import { adminsRoutes } from "./routes/admins";
import { configRoutes } from "./routes/config";
import { statsRoutes } from "./routes/stats";

export type AppEnv = { Variables: { username: string } };

let initialized = false;
async function ensureInit() {
	if (initialized) return;
	initialized = true;
	const { getDb } = await import("./db");
	const { ensureDefaultAdmin } = await import("./services/admins-repo");
	await getDb();
	await ensureDefaultAdmin();
}

export function createServerApp(): Hono<AppEnv> {
	const root = new Hono<AppEnv>({ strict: false });
	const app = root.basePath("/api");

	app.use("*", async (_c, next) => {
		await ensureInit();
		await next();
	});

	app.get("/__health", (c) => c.json({ ok: true, data: { status: "up" } }));

	app.route("/", authRoutes);
	app.route("/", postsRoutes);
	app.route("/", adminsRoutes);
	app.route("/", configRoutes);
	app.route("/", statsRoutes);
	app.route("/", aiSummaryRoutes);

	root.onError((err, c) => {
		console.error("[api]", c.req.method, c.req.path, err);
		return c.json(
			{ ok: false, error: { code: "internal", message: "Internal server error" } },
			500,
		);
	});

	root.notFound((c) =>
		c.json({ ok: false, error: { code: "not_found", message: "Not Found" } }, 404),
	);

	return root;
}

export const apiApp = createServerApp();
