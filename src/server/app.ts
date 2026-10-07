import { Hono } from "hono";

export type AppEnv = { Variables: { username: string } };

export function createServerApp(): Hono<AppEnv> {
	const root = new Hono<AppEnv>({ strict: false });
	const app = root.basePath("/api");

	app.get("/__health", (c) => c.json({ ok: true, data: { status: "up" } }));

	root.notFound((c) =>
		c.json({ ok: false, error: { code: "not_found", message: "Not Found" } }, 404),
	);

	return root;
}

export const apiApp = createServerApp();
