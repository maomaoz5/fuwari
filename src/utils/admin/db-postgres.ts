import crypto from "node:crypto";
import pg from "pg";
import type { DbDriver } from "./db-interface";
import {
	PBKDF2_ITERATIONS,
	PBKDF2_ITERATIONS_OLD,
	validatePasswordStrength,
} from "./security";

// ========== 密码哈希工具 ==========

function hashPassword(
	password: string,
	salt?: string,
): { hash: string; salt: string } {
	const useSalt = salt || crypto.randomBytes(16).toString("hex");
	const hash = crypto
		.pbkdf2Sync(password, useSalt, PBKDF2_ITERATIONS, 64, "sha512")
		.toString("hex");
	return { hash, salt: useSalt };
}

function verifyPassword(
	password: string,
	storedHash: string,
	salt: string,
): { valid: boolean; needsUpgrade: boolean } {
	// 先用新参数验证
	const newHash = crypto
		.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 64, "sha512")
		.toString("hex");
	if (newHash === storedHash) return { valid: true, needsUpgrade: false };

	// 再用旧参数验证（透明升级）
	const oldHash = crypto
		.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS_OLD, 64, "sha512")
		.toString("hex");
	if (oldHash === storedHash) return { valid: true, needsUpgrade: true };

	return { valid: false, needsUpgrade: false };
}

export class PostgresDriver implements DbDriver {
	private pool: pg.Pool | null = null;

	private getPool(): pg.Pool {
		if (this.pool) return this.pool;

		const connectionString =
			import.meta.env?.DATABASE_URL || process.env.DATABASE_URL;

		if (!connectionString) {
			throw new Error(
				"DATABASE_URL environment variable is required for PostgreSQL",
			);
		}

		this.pool = new pg.Pool({
			connectionString,
			max: 5,
		});

		return this.pool;
	}

	async init(): Promise<void> {
		const pool = this.getPool();

		await pool.query(`
      CREATE TABLE IF NOT EXISTS page_views (
        id SERIAL PRIMARY KEY,
        path TEXT NOT NULL,
        visited_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

		await pool.query(`
      CREATE TABLE IF NOT EXISTS article_views (
        id SERIAL PRIMARY KEY,
        slug TEXT NOT NULL,
        visited_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

		await pool.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

		await pool.query(
			"CREATE INDEX IF NOT EXISTS idx_page_views_visited_at ON page_views(visited_at)",
		);
		await pool.query(
			"CREATE INDEX IF NOT EXISTS idx_article_views_visited_at ON article_views(visited_at)",
		);
		await pool.query(
			"CREATE INDEX IF NOT EXISTS idx_article_views_slug ON article_views(slug)",
		);

		// 迁移：添加 email 和 reset_token 相关列
		await pool.query(
			"ALTER TABLE admins ADD COLUMN IF NOT EXISTS email TEXT DEFAULT ''",
		);
		await pool.query(
			"ALTER TABLE admins ADD COLUMN IF NOT EXISTS reset_token TEXT DEFAULT ''",
		);
		await pool.query(
			"ALTER TABLE admins ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMPTZ DEFAULT NULL",
		);

		await this.ensureDefaultAdmin();
	}

	private async ensureDefaultAdmin(): Promise<void> {
		const isDev = typeof import.meta !== "undefined" && import.meta.env?.DEV;
		const allowDefault = isDev || process.env.CREATE_DEFAULT_ADMIN === "true";
		if (!allowDefault) {
			console.warn(
				"[DB] Skipping default admin creation in production. Set CREATE_DEFAULT_ADMIN=true to enable.",
			);
			return;
		}

		const pool = this.getPool();
		const existing = await pool.query(
			"SELECT id FROM admins WHERE username = $1",
			["admin"],
		);
		if (existing.rows.length === 0) {
			const { hash, salt } = hashPassword("admin12345678");
			await pool.query(
				"INSERT INTO admins (username, password_hash, password_salt) VALUES ($1, $2, $3)",
				["admin", hash, salt],
			);
		}
	}

	async recordVisit(pagePath: string): Promise<void> {
		const pool = this.getPool();
		await pool.query("INSERT INTO page_views (path) VALUES ($1)", [pagePath]);
	}

	async recordArticleView(slug: string): Promise<void> {
		const pool = this.getPool();
		await pool.query("INSERT INTO article_views (slug) VALUES ($1)", [slug]);
	}

	private getDateFilter(range: "7d" | "30d" | "all"): string {
		if (range === "7d") return "visited_at >= NOW() - INTERVAL '7 days'";
		if (range === "30d") return "visited_at >= NOW() - INTERVAL '30 days'";
		return "1=1";
	}

	async getStats(range: "7d" | "30d" | "all"): Promise<{
		totalPageViews: number;
		totalArticleViews: number;
		dailyViews: { date: string; count: number }[];
		topArticles: { slug: string; count: number }[];
	}> {
		const pool = this.getPool();
		const filter = this.getDateFilter(range);

		const pageViewsResult = await pool.query(
			`SELECT COUNT(*) as count FROM page_views WHERE ${filter}`,
		);
		const pageViews = Number.parseInt(pageViewsResult.rows[0].count, 10);

		const articleViewsResult = await pool.query(
			`SELECT COUNT(*) as count FROM article_views WHERE ${filter}`,
		);
		const articleViews = Number.parseInt(articleViewsResult.rows[0].count, 10);

		const dailyViewsResult = await pool.query(`
      SELECT date, SUM(count) as count FROM (
        SELECT visited_at::date as date, COUNT(*) as count
        FROM page_views WHERE ${filter}
        GROUP BY visited_at::date
        UNION ALL
        SELECT visited_at::date as date, COUNT(*) as count
        FROM article_views WHERE ${filter}
        GROUP BY visited_at::date
      )
      GROUP BY date
      ORDER BY date ASC
    `);
		const dailyViews = dailyViewsResult.rows.map((r) => ({
			date: r.date.toISOString().split("T")[0],
			count: Number.parseInt(r.count, 10),
		}));

		const topArticlesResult = await pool.query(`
      SELECT slug, COUNT(*) as count
      FROM article_views
      WHERE ${filter}
      GROUP BY slug
      ORDER BY count DESC
      LIMIT 10
    `);
		const topArticles = topArticlesResult.rows.map((r) => ({
			slug: r.slug,
			count: Number.parseInt(r.count, 10),
		}));

		return {
			totalPageViews: pageViews,
			totalArticleViews: articleViews,
			dailyViews,
			topArticles,
		};
	}

	async createAdmin(username: string, password: string): Promise<boolean> {
		const strengthCheck = validatePasswordStrength(password);
		if (!strengthCheck.valid) {
			throw new Error(strengthCheck.error);
		}
		const pool = this.getPool();
		const { hash, salt } = hashPassword(password);
		try {
			const result = await pool.query(
				"INSERT INTO admins (username, password_hash, password_salt) VALUES ($1, $2, $3)",
				[username, hash, salt],
			);
			return (result.rowCount ?? 0) > 0;
		} catch {
			return false;
		}
	}

	async verifyAdmin(username: string, password: string): Promise<boolean> {
		const pool = this.getPool();
		const result = await pool.query(
			"SELECT password_hash, password_salt FROM admins WHERE username = $1",
			[username],
		);
		const row = result.rows[0];
		if (!row) return false;
		const { valid, needsUpgrade } = verifyPassword(
			password,
			row.password_hash,
			row.password_salt,
		);
		if (valid && needsUpgrade) {
			const upgradedHash = crypto
				.pbkdf2Sync(
					password,
					row.password_salt,
					PBKDF2_ITERATIONS,
					64,
					"sha512",
				)
				.toString("hex");
			await pool.query(
				"UPDATE admins SET password_hash = $1 WHERE username = $2",
				[upgradedHash, username],
			);
		}
		return valid;
	}

	async listAdmins(): Promise<
		{ id: number; username: string; email: string; createdAt: string }[]
	> {
		const pool = this.getPool();
		const result = await pool.query(
			"SELECT id, username, email, created_at FROM admins ORDER BY id ASC",
		);
		return result.rows.map((r) => ({
			id: r.id,
			username: r.username,
			email: r.email || "",
			createdAt: r.created_at.toISOString(),
		}));
	}

	async changePassword(
		username: string,
		newPassword: string,
	): Promise<boolean> {
		const strengthCheck = validatePasswordStrength(newPassword);
		if (!strengthCheck.valid) {
			throw new Error(strengthCheck.error);
		}
		const pool = this.getPool();
		const { hash, salt } = hashPassword(newPassword);
		const result = await pool.query(
			"UPDATE admins SET password_hash = $1, password_salt = $2 WHERE username = $3",
			[hash, salt, username],
		);
		return (result.rowCount ?? 0) > 0;
	}

	async deleteAdmin(username: string): Promise<boolean> {
		const pool = this.getPool();
		const countResult = await pool.query("SELECT COUNT(*) as cnt FROM admins");
		const count = Number.parseInt(countResult.rows[0].cnt, 10);
		if (count <= 1) return false;
		const result = await pool.query("DELETE FROM admins WHERE username = $1", [
			username,
		]);
		return (result.rowCount ?? 0) > 0;
	}

	async getAdminEmail(username: string): Promise<string | null> {
		const pool = this.getPool();
		const result = await pool.query(
			"SELECT email FROM admins WHERE username = $1",
			[username],
		);
		return result.rows[0]?.email || null;
	}

	async setAdminEmail(username: string, email: string): Promise<boolean> {
		const pool = this.getPool();
		const result = await pool.query(
			"UPDATE admins SET email = $1 WHERE username = $2",
			[email, username],
		);
		return (result.rowCount ?? 0) > 0;
	}

	async storeResetToken(
		username: string,
		token: string,
		expiresAt: Date,
	): Promise<boolean> {
		const pool = this.getPool();
		const result = await pool.query(
			"UPDATE admins SET reset_token = $1, reset_token_expires = $2 WHERE username = $3",
			[token, expiresAt, username],
		);
		return (result.rowCount ?? 0) > 0;
	}

	async consumeResetToken(token: string): Promise<string | null> {
		const pool = this.getPool();
		const result = await pool.query(
			"SELECT username FROM admins WHERE reset_token = $1 AND reset_token_expires > NOW()",
			[token],
		);
		const row = result.rows[0];
		if (!row) return null;
		await pool.query(
			"UPDATE admins SET reset_token = '', reset_token_expires = NULL WHERE username = $1",
			[row.username],
		);
		return row.username;
	}

	async clearResetToken(username: string): Promise<boolean> {
		const pool = this.getPool();
		const result = await pool.query(
			"UPDATE admins SET reset_token = '', reset_token_expires = NULL WHERE username = $1",
			[username],
		);
		return (result.rowCount ?? 0) > 0;
	}

	async close(): Promise<void> {
		if (this.pool) {
			await this.pool.end();
			this.pool = null;
		}
	}

	async resetForTesting(): Promise<void> {
		const pool = this.getPool();
		await pool.query("DELETE FROM admins");
		await this.ensureDefaultAdmin();
	}
}
