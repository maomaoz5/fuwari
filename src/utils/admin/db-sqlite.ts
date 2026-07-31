import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { DbDriver } from "./db-interface";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "stats.db");

// ========== 密码哈希工具 ==========

export function hashPassword(
	password: string,
	salt?: string,
): { hash: string; salt: string } {
	const useSalt = salt || crypto.randomBytes(16).toString("hex");
	const hash = crypto
		.pbkdf2Sync(password, useSalt, 10000, 64, "sha512")
		.toString("hex");
	return { hash, salt: useSalt };
}

export function verifyPassword(
	password: string,
	storedHash: string,
	salt: string,
): boolean {
	const { hash } = hashPassword(password, salt);
	return hash === storedHash;
}

export class SqliteDriver implements DbDriver {
	private db: Database.Database | null = null;

	private getDb(): Database.Database {
		if (this.db) return this.db;

		if (!fs.existsSync(DATA_DIR)) {
			fs.mkdirSync(DATA_DIR, { recursive: true });
		}

		this.db = new Database(DB_PATH);

		this.db.exec(`
      CREATE TABLE IF NOT EXISTS page_views (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT NOT NULL,
        visited_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS article_views (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL,
        visited_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_page_views_visited_at ON page_views(visited_at);
      CREATE INDEX IF NOT EXISTS idx_article_views_visited_at ON article_views(visited_at);
      CREATE INDEX IF NOT EXISTS idx_article_views_slug ON article_views(slug);
    `);

		return this.db;
	}

	async init(): Promise<void> {
		this.getDb();
		this.ensureDefaultAdmin();
	}

	private ensureDefaultAdmin(): void {
		const db = this.getDb();
		const existing = db
			.prepare("SELECT id FROM admins WHERE username = ?")
			.get("admin") as { id: number } | undefined;
		if (!existing) {
			const { hash, salt } = hashPassword("admin123");
			db.prepare(
				"INSERT INTO admins (username, password_hash, password_salt) VALUES (?, ?, ?)",
			).run("admin", hash, salt);
		}
	}

	async recordVisit(pagePath: string): Promise<void> {
		const db = this.getDb();
		const stmt = db.prepare("INSERT INTO page_views (path) VALUES (?)");
		stmt.run(pagePath);
	}

	async recordArticleView(slug: string): Promise<void> {
		const db = this.getDb();
		const stmt = db.prepare("INSERT INTO article_views (slug) VALUES (?)");
		stmt.run(slug);
	}

	private getDateFilter(range: "7d" | "30d" | "all"): string {
		if (range === "7d") return "visited_at >= datetime('now', '-7 days')";
		if (range === "30d") return "visited_at >= datetime('now', '-30 days')";
		return "1=1";
	}

	async getStats(range: "7d" | "30d" | "all"): Promise<{
		totalPageViews: number;
		totalArticleViews: number;
		dailyViews: { date: string; count: number }[];
		topArticles: { slug: string; count: number }[];
	}> {
		const db = this.getDb();
		const filter = this.getDateFilter(range);

		const pageViewsRow = db
			.prepare(`SELECT COUNT(*) as count FROM page_views WHERE ${filter}`)
			.get() as { count: number };

		const articleViewsRow = db
			.prepare(`SELECT COUNT(*) as count FROM article_views WHERE ${filter}`)
			.get() as { count: number };

		const dailyViews = db
			.prepare(`
        SELECT date, SUM(count) as count FROM (
          SELECT DATE(visited_at) as date, COUNT(*) as count
          FROM page_views WHERE ${filter}
          GROUP BY DATE(visited_at)
          UNION ALL
          SELECT DATE(visited_at) as date, COUNT(*) as count
          FROM article_views WHERE ${filter}
          GROUP BY DATE(visited_at)
        )
        GROUP BY date
        ORDER BY date ASC
      `)
			.all() as { date: string; count: number }[];

		const topArticles = db
			.prepare(`
        SELECT slug, COUNT(*) as count
        FROM article_views
        WHERE ${filter}
        GROUP BY slug
        ORDER BY count DESC
        LIMIT 10
      `)
			.all() as { slug: string; count: number }[];

		return {
			totalPageViews: pageViewsRow.count,
			totalArticleViews: articleViewsRow.count,
			dailyViews,
			topArticles,
		};
	}

	async createAdmin(username: string, password: string): Promise<boolean> {
		const db = this.getDb();
		const { hash, salt } = hashPassword(password);
		try {
			const result = db
				.prepare(
					"INSERT INTO admins (username, password_hash, password_salt) VALUES (?, ?, ?)",
				)
				.run(username, hash, salt);
			return result.changes > 0;
		} catch {
			return false;
		}
	}

	async verifyAdmin(username: string, password: string): Promise<boolean> {
		const db = this.getDb();
		const row = db
			.prepare(
				"SELECT password_hash, password_salt FROM admins WHERE username = ?",
			)
			.get(username) as
			| { password_hash: string; password_salt: string }
			| undefined;
		if (!row) return false;
		return verifyPassword(password, row.password_hash, row.password_salt);
	}

	async listAdmins(): Promise<
		{ id: number; username: string; createdAt: string }[]
	> {
		const db = this.getDb();
		const rows = db
			.prepare("SELECT id, username, created_at FROM admins ORDER BY id ASC")
			.all() as { id: number; username: string; created_at: string }[];
		return rows.map((r) => ({
			id: r.id,
			username: r.username,
			createdAt: r.created_at,
		}));
	}

	async changePassword(
		username: string,
		newPassword: string,
	): Promise<boolean> {
		const db = this.getDb();
		const { hash, salt } = hashPassword(newPassword);
		const result = db
			.prepare(
				"UPDATE admins SET password_hash = ?, password_salt = ? WHERE username = ?",
			)
			.run(hash, salt, username);
		return result.changes > 0;
	}

	async deleteAdmin(username: string): Promise<boolean> {
		const db = this.getDb();
		const count = db.prepare("SELECT COUNT(*) as cnt FROM admins").get() as {
			cnt: number;
		};
		if (count.cnt <= 1) return false;
		const result = db
			.prepare("DELETE FROM admins WHERE username = ?")
			.run(username);
		return result.changes > 0;
	}

	async close(): Promise<void> {
		if (this.db) {
			this.db.close();
			this.db = null;
		}
	}

	async resetForTesting(): Promise<void> {
		const db = this.getDb();
		db.exec("DELETE FROM admins");
		this.ensureDefaultAdmin();
	}
}
