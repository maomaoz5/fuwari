import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { Hono } from "hono";
import { ensureSchema, setDb } from "../db";
import * as schema from "../db/schema-sqlite";
import { createSession, revokeSession } from "../services/session";
import { requireAuth } from "./auth";

const app = new Hono();
app.use("/protected/*", requireAuth);
app.get("/protected/whoami", (c) => c.json({ username: c.get("username") }));

describe("requireAuth middleware", () => {
	beforeEach(async () => {
		const sqlite = new Database(":memory:");
		const db = drizzle(sqlite, { schema });
		await ensureSchema(db);
		setDb(db);
	});

	it("rejects without token with 401 envelope", async () => {
		const res = await app.request("/protected/whoami");
		expect(res.status).toBe(401);
		const body = await res.json();
		expect(body).toEqual({
			ok: false,
			error: { code: "unauthorized", message: "Unauthorized" },
		});
	});

	it("accepts valid session cookie", async () => {
		const token = await createSession("admin");
		const res = await app.request("/protected/whoami", {
			headers: { cookie: `fuwari_session=${token}` },
		});
		expect(res.status).toBe(200);
		expect((await res.json()).username).toBe("admin");
	});

	it("accepts Bearer token fallback", async () => {
		const token = await createSession("admin");
		const res = await app.request("/protected/whoami", {
			headers: { Authorization: `Bearer ${token}` },
		});
		expect(res.status).toBe(200);
	});

	it("rejects revoked session", async () => {
		const token = await createSession("admin");
		await revokeSession(token);
		const res = await app.request("/protected/whoami", {
			headers: { cookie: `fuwari_session=${token}` },
		});
		expect(res.status).toBe(401);
	});
});
