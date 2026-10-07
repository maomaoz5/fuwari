import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { ensureSchema, getDb, setDb } from "../db";
import * as schema from "../db/schema-sqlite";
import { checkRateLimit } from "./rate-limit";

describe("rate limiter", () => {
	beforeEach(async () => {
		const sqlite = new Database(":memory:");
		const db = drizzle(sqlite, { schema });
		await ensureSchema(db);
		setDb(db);
	});

	it("allows up to max then blocks with retryAfter", async () => {
		for (let i = 0; i < 3; i++) {
			expect((await checkRateLimit("k", 3, 60_000)).allowed).toBe(true);
		}
		const blocked = await checkRateLimit("k", 3, 60_000);
		expect(blocked.allowed).toBe(false);
		expect(blocked.retryAfter).toBeGreaterThan(0);
		expect(blocked.retryAfter).toBeLessThanOrEqual(60);
	});

	it("independent keys", async () => {
		expect((await checkRateLimit("a", 1, 60_000)).allowed).toBe(true);
		expect((await checkRateLimit("b", 1, 60_000)).allowed).toBe(true);
		expect((await checkRateLimit("a", 1, 60_000)).allowed).toBe(false);
	});

	it("window expiry resets the counter", async () => {
		expect((await checkRateLimit("k", 1, 60_000)).allowed).toBe(true);
		expect((await checkRateLimit("k", 1, 60_000)).allowed).toBe(false);
		const { db, t } = await getDb();
		await db
			.update(t.rateLimits)
			.set({ windowExpiresAt: "2000-01-01T00:00:00Z" })
			.where(eq(t.rateLimits.key, "k"));
		expect((await checkRateLimit("k", 1, 60_000)).allowed).toBe(true);
	});
});
