import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { sql } from "drizzle-orm";
import {
	type BetterSQLite3Database,
	drizzle,
} from "drizzle-orm/better-sqlite3";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as pgSchema from "./schema-pg";
import * as sqliteSchema from "./schema-sqlite";

export type SqliteDb = BetterSQLite3Database<typeof sqliteSchema>;
export type PgDb = NodePgDatabase<typeof pgSchema>;
// PG 实例在 getDb 中被转换为该形状:两个方言的查询构建器调用签名一致,
// 表对象经 getTables() 也已对齐,联合类型会让 delete/insert 等调用处报 TS2349。
export type Db = SqliteDb;
export type Tables = typeof sqliteSchema;

export function getDialect(): "sqlite" | "postgres" {
	return (process.env.DB_TYPE || "sqlite") === "postgres"
		? "postgres"
		: "sqlite";
}

export function getTables(): Tables {
	return (getDialect() === "postgres"
		? pgSchema
		: sqliteSchema) as unknown as Tables;
}

let db: Db | null = null;

export function setDb(next: Db): void {
	db = next;
}

const SQLITE_DDL = [
	`CREATE TABLE IF NOT EXISTS page_views (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		path TEXT NOT NULL,
		visited_at TEXT NOT NULL DEFAULT (datetime('now'))
	)`,
	`CREATE TABLE IF NOT EXISTS article_views (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		slug TEXT NOT NULL,
		visited_at TEXT NOT NULL DEFAULT (datetime('now'))
	)`,
	`CREATE TABLE IF NOT EXISTS admins (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		username TEXT UNIQUE NOT NULL,
		password_hash TEXT NOT NULL,
		password_salt TEXT NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		email TEXT NOT NULL DEFAULT '',
		reset_token TEXT NOT NULL DEFAULT '',
		reset_token_expires TEXT
	)`,
	`CREATE TABLE IF NOT EXISTS sessions (
		token_hash TEXT PRIMARY KEY,
		username TEXT NOT NULL,
		created_at TEXT NOT NULL,
		expires_at TEXT NOT NULL,
		ip TEXT,
		user_agent TEXT
	)`,
	`CREATE TABLE IF NOT EXISTS rate_limits (
		key TEXT PRIMARY KEY,
		count INTEGER NOT NULL DEFAULT 0,
		window_expires_at TEXT NOT NULL
	)`,
	"CREATE INDEX IF NOT EXISTS idx_page_views_visited_at ON page_views(visited_at)",
	"CREATE INDEX IF NOT EXISTS idx_article_views_visited_at ON article_views(visited_at)",
	"CREATE INDEX IF NOT EXISTS idx_article_views_slug ON article_views(slug)",
];

const PG_DDL = [
	`CREATE TABLE IF NOT EXISTS page_views (
		id SERIAL PRIMARY KEY,
		path TEXT NOT NULL,
		visited_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	)`,
	`CREATE TABLE IF NOT EXISTS article_views (
		id SERIAL PRIMARY KEY,
		slug TEXT NOT NULL,
		visited_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	)`,
	`CREATE TABLE IF NOT EXISTS admins (
		id SERIAL PRIMARY KEY,
		username TEXT UNIQUE NOT NULL,
		password_hash TEXT NOT NULL,
		password_salt TEXT NOT NULL,
		created_at TIMESTAMPTZ DEFAULT NOW(),
		email TEXT NOT NULL DEFAULT '',
		reset_token TEXT NOT NULL DEFAULT '',
		reset_token_expires TIMESTAMPTZ DEFAULT NULL
	)`,
	`CREATE TABLE IF NOT EXISTS sessions (
		token_hash TEXT PRIMARY KEY,
		username TEXT NOT NULL,
		created_at TIMESTAMPTZ NOT NULL,
		expires_at TIMESTAMPTZ NOT NULL,
		ip TEXT,
		user_agent TEXT
	)`,
	`CREATE TABLE IF NOT EXISTS rate_limits (
		key TEXT PRIMARY KEY,
		count INTEGER NOT NULL DEFAULT 0,
		window_expires_at TIMESTAMPTZ NOT NULL
	)`,
	"CREATE INDEX IF NOT EXISTS idx_page_views_visited_at ON page_views(visited_at)",
	"CREATE INDEX IF NOT EXISTS idx_article_views_visited_at ON article_views(visited_at)",
	"CREATE INDEX IF NOT EXISTS idx_article_views_slug ON article_views(slug)",
	`ALTER TABLE admins ADD COLUMN IF NOT EXISTS email TEXT DEFAULT ''`,
	`ALTER TABLE admins ADD COLUMN IF NOT EXISTS reset_token TEXT DEFAULT ''`,
	"ALTER TABLE admins ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMPTZ DEFAULT NULL",
];

export async function ensureSchema(db: Db): Promise<void> {
	const dialect = getDialect();
	const ddls = dialect === "postgres" ? PG_DDL : SQLITE_DDL;
	for (const ddl of ddls) {
		if (dialect === "postgres") {
			await (db as unknown as PgDb).execute(sql.raw(ddl));
		} else {
			db.run(sql.raw(ddl));
		}
	}
}

export async function getDb(): Promise<{ db: Db; t: Tables }> {
	if (!db) {
		if (getDialect() === "postgres") {
			const { drizzle: drizzlePg } = await import("drizzle-orm/node-postgres");
			const pg = (await import("pg")).default;
			const connectionString = process.env.DATABASE_URL;
			if (!connectionString) {
				throw new Error(
					"DATABASE_URL environment variable is required for PostgreSQL",
				);
			}
			const dialectDb = drizzlePg(new pg.Pool({ connectionString, max: 5 }));
			db = dialectDb as unknown as Db;
		} else {
			const dataDir = path.join(process.cwd(), "data");
			if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
			db = drizzle(new Database(path.join(dataDir, "stats.db")), {
				schema: sqliteSchema,
			});
		}
		await ensureSchema(db);
	}
	return { db, t: getTables() };
}
