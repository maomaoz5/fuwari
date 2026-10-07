import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { ensureSchema, getDb, setDb } from "../db";
import * as schema from "../db/schema-sqlite";
import { createSession, revokeSession, validateSession } from "./session";

describe("session service", () => {
	beforeEach(async () => {
		const sqlite = new Database(":memory:");
		const db = drizzle(sqlite, { schema });
		await ensureSchema(db);
		setDb(db);
	});

	it("create → validate roundtrip", async () => {
		const token = await createSession("admin", "1.2.3.4", "ua");
		expect(await validateSession(token)).toBe("admin");
	});

	it("unknown token → null", async () => {
		expect(await validateSession("nope")).toBeNull();
	});

	it("revoke → validate null", async () => {
		const token = await createSession("admin");
		await revokeSession(token);
		expect(await validateSession(token)).toBeNull();
	});

	it("expired session is rejected and deleted", async () => {
		const token = await createSession("admin");
		const { db, t } = await getDb();
		await db.update(t.sessions).set({ expiresAt: "2000-01-01T00:00:00Z" });
		expect(await validateSession(token)).toBeNull();
	});
});
