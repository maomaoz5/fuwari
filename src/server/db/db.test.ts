import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { ensureSchema, getDb, getDialect, getTables, setDb } from "./index";
import * as schema from "./schema-sqlite";

describe("db engine", () => {
	it("creates schema and allows roundtrip insert/select", async () => {
		const sqlite = new Database(":memory:");
		const db = drizzle(sqlite, { schema });
		await ensureSchema(db);
		setDb(db);

		expect(getDialect()).toBe("sqlite");
		const t = getTables();

		await db.insert(t.admins).values({
			username: "alice",
			passwordHash: "h",
			passwordSalt: "s",
		});
		await db.insert(t.sessions).values({
			tokenHash: "th",
			username: "alice",
			createdAt: "2026-10-07T00:00:00Z",
			expiresAt: "2026-10-08T00:00:00Z",
		});
		await db.insert(t.rateLimits).values({
			key: "login:1.2.3.4",
			count: 1,
			windowExpiresAt: "2026-10-07T00:15:00Z",
		});

		const admins = await db.select().from(t.admins).where(eq(t.admins.username, "alice"));
		expect(admins).toHaveLength(1);
		expect(admins[0].email).toBe("");

		const ctx = await getDb();
		expect(ctx.t.admins).toBe(t.admins);
	});
});
