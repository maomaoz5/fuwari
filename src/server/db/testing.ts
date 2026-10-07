import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { ensureSchema, setDb } from "./index";
import * as schema from "./schema-sqlite";
import { ensureDefaultAdmin } from "../services/admins-repo";

export async function initTestDb(): Promise<void> {
	const sqlite = new Database(":memory:");
	const db = drizzle(sqlite, { schema });
	await ensureSchema(db);
	setDb(db);
	await ensureDefaultAdmin();
}
