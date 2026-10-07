# 后端管理面板全栈重写 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 Hono + Drizzle 重写全部后端 API,用独立 Svelte SPA 重写管理面板,功能与现状完全对齐,消除双数据库驱动重复、内存 session、鉴权冗余等问题。

**Architecture:** Astro middleware 将 `/api/*` 委托给 Hono app(承载全部后端逻辑);Drizzle ORM 一套查询代码支持 SQLite/PostgreSQL 双引擎;session 与限速落库;管理面板为独立 Vite 构建的 Svelte SPA,产物输出到 `public/admin/`,hash 路由,无需服务端 fallback。

**Tech Stack:** Astro 7 (SSR, node standalone) / Hono / zod / drizzle-orm + better-sqlite3 + pg / Svelte 5 / Tailwind v4 / Vitest

**Spec:** `docs/superpowers/specs/2026-10-07-admin-panel-rewrite-design.md`

## Global Constraints

- 包管理只用 pnpm(`preinstall` 强制);新增依赖用 `pnpm add` 安装在项目根目录
- 代码风格:Biome(tab 缩进、双引号);提交前跑 `pnpm lint`
- 类型检查:`pnpm check`(tsc --noEmit);全量测试:`pnpm test`(vitest run)
- 环境变量名保持不变:`DB_TYPE`、`DATABASE_URL`、`SITE_URL`、`RESEND_API_KEY`、`SMTP_FROM`、`TURNSTILE_SECRET_KEY`、`HCAPTCHA_SECRET_KEY`、`CREATE_DEFAULT_ADMIN`
- 表结构零变更(`admins`/`page_views`/`article_views` 沿用现有列);新表仅 `sessions`、`rate_limits`
- API 路径保持现状:管理接口为 `/api/admin/*`,公开埋点为 `/api/stats/record`
- 博客前台(`src/pages`、`src/layouts`、`src/components` 非 admin 部分、`src/integrations`)不许改动
- 提交信息格式沿用仓库风格:`feat: xxx` / `fix: xxx` / `test: xxx` / `refactor: xxx`(中文描述)
- 本地 dev server 已知绑定 IPv6 `[::1]` 导致浏览器打不开 localhost——验证时用 `pnpm dev --host 127.0.0.1` 并访问 `http://127.0.0.1:4321`
- UI 浏览器验证优先使用 browser-use 连接用户本地 Chrome

## 与 spec 的两处勘误(以现状代码为准)

1. **登录限速实际是 10 次/15min**(`security.ts:7` `RATE_LIMIT_MAX_ATTEMPTS = 10`),spec 写的 5 次有误。新实现沿用 10 次/15min。
2. **`POST /api/posts` 创建路由已存在**(`src/pages/api/admin/posts/index.ts:26`),无需新增,重写中保留。AI 总结 `[slug]` POST 保持 501 占位(用户已确认功能零增减)。

## 现状 API 行为清单(重写必须逐条对齐)

| 端点 | 方法 | 鉴权 | 行为要点 |
|---|---|---|---|
| `/api/admin/auth` | POST | 公开+限速10/15min/IP+验证码 | 成功设 `fuwari_session` cookie(HttpOnly/Strict/Secure非dev/Max-Age 86400);失败清 cookie 返回 401「用户名或密码错误」;验证码失败返回 captchaInfo/captchaError |
| `/api/admin/auth/forgot-password` | POST | 公开+限速3/15min/IP+验证码 | 无论用户名是否存在都返回同一消息(防枚举);token 30min 有效;`SITE_URL` 拼接重置链接 |
| `/api/admin/auth/reset-password` | POST | 公开 | 消费 token→强度校验(≥12字符)→改密 |
| `/api/admin/logout` | POST | 公开 | 删 session、清 cookie,恒 200 |
| `/api/admin/me` | GET | 需登录 | 返回 `{username}` |
| `/api/admin/captcha-config` | GET | 公开 | 返回 `{enabled, provider, siteKey}` |
| `/api/admin/posts` | GET/POST | 需登录 | GET 列表(按 published 倒序);POST 创建(201),slug 已存在报错 |
| `/api/admin/posts/[slug]` | GET/PUT/DELETE | 需登录 | slug 格式校验(小写字母数字连字符);DELETE 不存在返回 404 |
| `/api/admin/admins` | GET/POST | 需登录 | POST 密码强度校验;用户名重复 409 |
| `/api/admin/admins/[username]` | PUT/DELETE | 需登录 | PUT 校验**目标账号**当前密码;DELETE 校验**操作者**密码且不能删最后一个管理员 |
| `/api/admin/update-email` | POST | 需登录 | 设置**操作者**邮箱,简单正则校验 |
| `/api/admin/config` | GET/PUT | 需登录 | PUT 顶层 key 白名单:site/navBar/profile/license/expressiveCode/aiSummary/captcha;整包覆盖写 `data/config-overrides.json` |
| `/api/admin/stats` | GET | 需登录 | `?range=7d\|30d\|all`(默认 7d) |
| `/api/stats/record` | POST | 公开 | `{type:'article',slug}` 记两次(page_views + article_views);否则记 page_views(path 默认 '/');**响应保持 `{success:true}` 旧格式**(博客前台 fire-and-forget,不解析)。新增限速 60 次/15min/IP |
| `/api/admin/ai-summary` | GET | 需登录 | 列 `public/ai-summaries/*.json` 元信息 |
| `/api/admin/ai-summary/[slug]` | DELETE/POST | 需登录 | DELETE 删缓存;POST 恒 501 |

## 新 API 响应契约

- 统一封装:`{ ok: true, data: ... }` / `{ ok: false, error: { code, message, ...extras } }`
- 唯一例外:`POST /api/stats/record` 保持 `{ success: true }`(博客前台兼容)
- 登录验证码失败:`error: { code: "captcha_failed", message, captchaInfo, captchaError }`(SPA 需要这两个字段重渲染验证码)
- 限速 429:`error: { code: "rate_limited", message, retryAfter }`
- Hono `strict: false`(容忍尾斜杠,兼容博客前台 `/api/stats/record/` 调用)

## 目标文件结构

```
src/server/
├── app.ts                    # createServerApp() 工厂 + apiApp 单例
├── http.ts                   # ok/fail 工具 + AppEnv 类型
├── db/
│   ├── schema-sqlite.ts      # sqliteTable 定义
│   ├── schema-pg.ts          # pgTable 定义(列名一一对应)
│   ├── index.ts              # getDialect/getDb/setDb/ensureSchema
│   └── testing.ts            # initTestDb()(仅测试导入)
├── middleware/auth.ts        # requireAuth(Hono 中间件)
├── routes/                   # auth / posts / admins / config / stats / ai-summary
└── services/
    ├── security.ts           # 常量+哈希+slug+密码强度
    ├── session.ts            # DB session + cookie + IP 提取
    ├── rate-limit.ts         # DB 固定窗口限速
    ├── captcha.ts            # 移植(双 provider)
    ├── email.ts              # 移植(Resend)
    ├── config-store.ts       # 移植(overrides JSON)
    ├── post-files.ts         # 移植(Markdown CRUD)
    └── admins-repo.ts        # 管理员数据访问
src/admin-spa/                # 管理面板 SPA(独立 Vite 构建)
├── vite.config.ts
├── index.html
└── src/{main.ts, app.css, api.ts, router.ts, App.svelte,
         components/Captcha.svelte,
         pages/{Login,ResetPassword,Dashboard,Posts,PostEditor,Admins,Config,Stats,AiSummary}.svelte}
```

---

### Task 1: 依赖安装 + Hono 骨架 + Astro 集成 spike

**Files:**
- Create: `src/server/app.ts`
- Modify: `src/middleware.ts`
- Modify: `package.json`(经 pnpm add)

**Interfaces:**
- Produces: `createServerApp(): Hono<AppEnv>`、`apiApp: Hono`(basePath `/api`)。后续所有路由任务向 `createServerApp` 内挂载。

- [ ] **Step 1: 安装依赖**

```bash
pnpm add hono zod drizzle-orm
```

(better-sqlite3、pg 已是项目依赖)

- [ ] **Step 2: 创建 Hono 入口**

`src/server/app.ts`:

```ts
import { Hono } from "hono";

export type AppEnv = { Variables: { username: string } };

export function createServerApp(): Hono<AppEnv> {
	const app = new Hono<AppEnv>({ strict: false });

	app.get("/__health", (c) => c.json({ ok: true, data: { status: "up" } }));

	app.notFound((c) =>
		c.json({ ok: false, error: { code: "not_found", message: "Not Found" } }, 404),
	);

	return app;
}

export const apiApp = createServerApp().basePath("/api");
```

- [ ] **Step 3: 中间件委托(spike 阶段只委托 __health 一条路径,不影响旧 API)**

`src/middleware.ts` 整体替换为:

```ts
import { defineMiddleware } from "astro:middleware";
import { siteConfig } from "@/config";
import { apiApp } from "@/server/app";

const normalizePath = (path: string) => path.replace(/\/$/, "") || "/";

export const onRequest = defineMiddleware(async (context, next) => {
	const url = new URL(context.request.url);
	const pathname = normalizePath(url.pathname);

	// spike:仅验证 Astro middleware → Hono 转发链路可行
	if (pathname === "/api/__health") {
		return apiApp.fetch(context.request);
	}

	const response = await next();
	response.headers.set("X-Content-Type-Options", "nosniff");
	response.headers.set("X-Frame-Options", "DENY");
	const contentType = response.headers.get("Content-Type") || "";
	if (contentType.includes("text/html")) {
		const html = await response.text();
		const hueStyle = `<style>:root{--hue:${siteConfig.themeColor.hue}}</style>`;
		const injected = html.replace("</head>", `${hueStyle}</head>`);
		return new Response(injected, {
			status: response.status,
			statusText: response.statusText,
			headers: response.headers,
		});
	}
	return response;
});
```

注意:此时旧的 `/admin` 鉴权逻辑暂时移除——旧管理面板在 Task 16 之前处于无人保护状态,**本任务在本地开发分支上进行,不部署**。若担心,可临时保留旧鉴权分支,Task 16 时删除。

- [ ] **Step 4: 手动验证 spike**

```bash
pnpm dev --host 127.0.0.1
```

用 browser-use 打开 `http://127.0.0.1:4321/api/__health`,期望 `{"ok":true,"data":{"status":"up"}}`;再打开博客首页确认正常渲染(含 `--hue` 注入);访问 `http://127.0.0.1:4321/api/admin/me` 确认旧路由仍工作。

- [ ] **Step 5: 提交**

```bash
git add src/server/app.ts src/middleware.ts package.json pnpm-lock.yaml
git commit -m "feat: 引入 Hono 作为 API 层并验证 Astro middleware 转发链路"
```

---

### Task 2: Drizzle 双方言 schema + 引擎工厂 + ensureSchema + 测试基建

**Files:**
- Create: `src/server/db/schema-sqlite.ts`、`src/server/db/schema-pg.ts`、`src/server/db/index.ts`
- Test: `src/server/db/db.test.ts`
- Modify: `vitest.config.ts`、`tsconfig.json`

**Interfaces:**
- Produces:
  - `getDialect(): "sqlite" | "postgres"`(每次调用读 `process.env.DB_TYPE`,默认 `"sqlite"`)
  - `getDb(): Promise<{ db: Db; t: Tables }>`(单例;首次调用自动建目录/连接池并执行 `ensureSchema`)
  - `setDb(db: Db): void`(测试注入)
  - `ensureSchema(db: Db): Promise<void>`(幂等 DDL)
  - `Tables` 类型 = sqlite schema 的形状;两个 schema 文件列名一一对应
  - 表对象:`admins`、`sessions`、`rateLimits`、`pageViews`、`articleViews`

- [ ] **Step 1: 写失败测试**

`src/server/db/db.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { ensureSchema, setDb, getDb, getTables, getDialect } from "./index";

describe("db engine", () => {
	it("creates schema and allows roundtrip insert/select", async () => {
		const sqlite = new Database(":memory:");
		const db = drizzle(sqlite);
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test -- src/server/db/db.test.ts`
Expected: FAIL(模块不存在)

- [ ] **Step 3: 实现 schema 与引擎工厂**

`src/server/db/schema-sqlite.ts`:

```ts
import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const admins = sqliteTable("admins", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	username: text("username").notNull().unique(),
	passwordHash: text("password_hash").notNull(),
	passwordSalt: text("password_salt").notNull(),
	createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
	email: text("email").notNull().default(""),
	resetToken: text("reset_token").notNull().default(""),
	resetTokenExpires: text("reset_token_expires"),
});

export const sessions = sqliteTable("sessions", {
	tokenHash: text("token_hash").primaryKey(),
	username: text("username").notNull(),
	createdAt: text("created_at").notNull(),
	expiresAt: text("expires_at").notNull(),
	ip: text("ip"),
	userAgent: text("user_agent"),
});

export const rateLimits = sqliteTable("rate_limits", {
	key: text("key").primaryKey(),
	count: integer("count").notNull(),
	windowExpiresAt: text("window_expires_at").notNull(),
});

export const pageViews = sqliteTable("page_views", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	path: text("path").notNull(),
	visitedAt: text("visited_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const articleViews = sqliteTable("article_views", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	slug: text("slug").notNull(),
	visitedAt: text("visited_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
```

`src/server/db/schema-pg.ts`(列名与 sqlite 版一一对应;时间列用 `mode: "string"` 保证两个方言读出来都是字符串):

```ts
import { sql } from "drizzle-orm";
import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const admins = pgTable("admins", {
	id: serial("id").primaryKey(),
	username: text("username").notNull().unique(),
	passwordHash: text("password_hash").notNull(),
	passwordSalt: text("password_salt").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
		.notNull()
		.default(sql`NOW()`),
	email: text("email").notNull().default(""),
	resetToken: text("reset_token").notNull().default(""),
	resetTokenExpires: timestamp("reset_token_expires", { withTimezone: true, mode: "string" }),
});

export const sessions = pgTable("sessions", {
	tokenHash: text("token_hash").primaryKey(),
	username: text("username").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }).notNull(),
	ip: text("ip"),
	userAgent: text("user_agent"),
});

export const rateLimits = pgTable("rate_limits", {
	key: text("key").primaryKey(),
	count: integer("count").notNull(),
	windowExpiresAt: timestamp("window_expires_at", { withTimezone: true, mode: "string" }).notNull(),
});

export const pageViews = pgTable("page_views", {
	id: serial("id").primaryKey(),
	path: text("path").notNull(),
	visitedAt: timestamp("visited_at", { withTimezone: true, mode: "string" })
		.notNull()
		.default(sql`NOW()`),
});

export const articleViews = pgTable("article_views", {
	id: serial("id").primaryKey(),
	slug: text("slug").notNull(),
	visitedAt: timestamp("visited_at", { withTimezone: true, mode: "string" })
		.notNull()
		.default(sql`NOW()`),
});
```

`src/server/db/index.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import * as pgSchema from "./schema-pg";
import * as sqliteSchema from "./schema-sqlite";

export type SqliteDb = BetterSQLite3Database<typeof sqliteSchema>;
export type PgDb = NodePgDatabase<typeof pgSchema>;
export type Db = SqliteDb | PgDb;
export type Tables = typeof sqliteSchema;

export function getDialect(): "sqlite" | "postgres" {
	return (process.env.DB_TYPE || "sqlite") === "postgres" ? "postgres" : "sqlite";
}

export function getTables(): Tables {
	return (getDialect() === "postgres" ? pgSchema : sqliteSchema) as unknown as Tables;
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
	`CREATE INDEX IF NOT EXISTS idx_page_views_visited_at ON page_views(visited_at)`,
	`CREATE INDEX IF NOT EXISTS idx_article_views_visited_at ON article_views(visited_at)`,
	`CREATE INDEX IF NOT EXISTS idx_article_views_slug ON article_views(slug)`,
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
	`CREATE INDEX IF NOT EXISTS idx_page_views_visited_at ON page_views(visited_at)`,
	`CREATE INDEX IF NOT EXISTS idx_article_views_visited_at ON article_views(visited_at)`,
	`CREATE INDEX IF NOT EXISTS idx_article_views_slug ON article_views(slug)`,
	`ALTER TABLE admins ADD COLUMN IF NOT EXISTS email TEXT DEFAULT ''`,
	`ALTER TABLE admins ADD COLUMN IF NOT EXISTS reset_token TEXT DEFAULT ''`,
	`ALTER TABLE admins ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMPTZ DEFAULT NULL`,
];

export async function ensureSchema(db: Db): Promise<void> {
	const dialect = getDialect();
	const ddls = dialect === "postgres" ? PG_DDL : SQLITE_DDL;
	for (const ddl of ddls) {
		if (dialect === "postgres") {
			await (db as PgDb).execute(sql.raw(ddl));
		} else {
			(db as SqliteDb).run(sql.raw(ddl));
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
				throw new Error("DATABASE_URL environment variable is required for PostgreSQL");
			}
			db = drizzlePg(new pg.Pool({ connectionString, max: 5 }));
		} else {
			const dataDir = path.join(process.cwd(), "data");
			if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
			db = drizzle(new Database(path.join(dataDir, "stats.db")));
		}
		await ensureSchema(db);
	}
	return { db, t: getTables() };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm test -- src/server/db/db.test.ts`
Expected: PASS

- [ ] **Step 5: 测试基建——vitest setup + 路径别名**

`vitest.config.ts` 修改(加 setupFiles 与 `@server` 别名):

```ts
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['vitest.setup.ts'],
  },
  resolve: {
    alias: {
      '@components': resolve(__dirname, 'src/components'),
      '@assets': resolve(__dirname, 'src/assets'),
      '@constants': resolve(__dirname, 'src/constants'),
      '@utils': resolve(__dirname, 'src/utils'),
      '@i18n': resolve(__dirname, 'src/i18n'),
      '@layouts': resolve(__dirname, 'src/layouts'),
      '@server': resolve(__dirname, 'src/server'),
      '@': resolve(__dirname, 'src'),
    },
  },
})
```

新建 `vitest.setup.ts`(仓库根目录;所有后端测试跑 SQLite + 默认管理员 + 验证码禁用):

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DB_TYPE = "sqlite";
process.env.CREATE_DEFAULT_ADMIN = "true";

// 验证码禁用:captcha provider 从覆盖配置读取
const overridesPath = path.join(os.tmpdir(), `fuwari-test-overrides-${process.pid}.json`);
fs.writeFileSync(overridesPath, JSON.stringify({ captcha: { provider: "none" } }));
process.env.CONFIG_OVERRIDES_PATH = overridesPath;
```

`tsconfig.json` 的 `paths` 中追加:

```json
"@server/*": ["./src/server/*"]
```

- [ ] **Step 6: 全量回归 + 提交**

```bash
pnpm check && pnpm test
```

(旧 `admin-db.test.ts` 仍应通过——它直接调旧 stats-db,不受影响)

```bash
git add src/server/db vitest.config.ts vitest.setup.ts tsconfig.json
git commit -m "feat: Drizzle 双引擎 schema 与工厂,session/rate_limits 建表"
```

---

### Task 3: security 服务(哈希/slug/密码强度)

**Files:**
- Create: `src/server/services/security.ts`
- Test: `src/server/services/security.test.ts`

**Interfaces:**
- Produces:
  - `PBKDF2_ITERATIONS = 600_000`、`PBKDF2_ITERATIONS_OLD = 10_000`、`SESSION_TTL_MS = 86_400_000`、`MIN_PASSWORD_LENGTH = 12`、`RATE_LIMIT_MAX_ATTEMPTS = 10`、`RATE_LIMIT_WINDOW_MS = 900_000`
  - `hashPassword(password: string, salt?: string): { hash: string; salt: string }`
  - `verifyPassword(password: string, storedHash: string, salt: string): { valid: boolean; needsUpgrade: boolean }`
  - `validateSlug(slug: string): boolean`
  - `validatePasswordStrength(password: string): { valid: boolean; error?: string }`

- [ ] **Step 1: 写失败测试**

`src/server/services/security.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
	hashPassword,
	verifyPassword,
	validateSlug,
	validatePasswordStrength,
	PBKDF2_ITERATIONS_OLD,
} from "./security";

describe("security", () => {
	it("hash and verify roundtrip", () => {
		const { hash, salt } = hashPassword("password123456");
		expect(verifyPassword("password123456", hash, salt)).toEqual({
			valid: true,
			needsUpgrade: false,
		});
		expect(verifyPassword("wrongpassword1", hash, salt).valid).toBe(false);
	});

	it("detects old-iteration hash and flags upgrade", () => {
		const salt = "aabbccdd";
		const oldHash = ""; // 由实现内 PBKDF2_ITERATIONS_OLD 计算
		const { hash } = hashPassword("password123456", salt);
		expect(hash).not.toBe(oldHash);
		// 用旧参数手工计算旧哈希,验证 needsUpgrade 路径
		const crypto = require("node:crypto");
		const legacyHash = crypto
			.pbkdf2Sync("password123456", salt, PBKDF2_ITERATIONS_OLD, 64, "sha512")
			.toString("hex");
		expect(verifyPassword("password123456", legacyHash, salt)).toEqual({
			valid: true,
			needsUpgrade: true,
		});
	});

	it("validates slugs", () => {
		expect(validateSlug("my-post-1")).toBe(true);
		expect(validateSlug("My_Post")).toBe(false);
		expect(validateSlug("a/b")).toBe(false);
		expect(validateSlug("..")).toBe(false);
		expect(validateSlug("a\\b")).toBe(false);
	});

	it("validates password strength", () => {
		expect(validatePasswordStrength("short").valid).toBe(false);
		expect(validatePasswordStrength("12charsmin123").valid).toBe(true);
	});
});
```

(删掉 `const oldHash = ""` 那两行占位——直接保留 legacyHash 断言即可;上面代码里旧参数计算就是测试本体)

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test -- src/server/services/security.test.ts`
Expected: FAIL(模块不存在)

- [ ] **Step 3: 实现**

`src/server/services/security.ts`(逻辑逐行取自 `src/utils/admin/security.ts` + `db-sqlite.ts` 的哈希函数,零行为变更):

```ts
import crypto from "node:crypto";

export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
export const PBKDF2_ITERATIONS = 600_000;
export const PBKDF2_ITERATIONS_OLD = 10_000;
export const MIN_PASSWORD_LENGTH = 12;
export const RATE_LIMIT_MAX_ATTEMPTS = 10;
export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validateSlug(slug: string): boolean {
	if (slug.includes("..") || slug.includes("/") || slug.includes("\\")) {
		return false;
	}
	return SLUG_REGEX.test(slug);
}

export function validatePasswordStrength(password: string): {
	valid: boolean;
	error?: string;
} {
	if (password.length < MIN_PASSWORD_LENGTH) {
		return { valid: false, error: "密码长度至少为12个字符" };
	}
	return { valid: true };
}

export function hashPassword(
	password: string,
	salt?: string,
): { hash: string; salt: string } {
	const useSalt = salt || crypto.randomBytes(16).toString("hex");
	const hash = crypto
		.pbkdf2Sync(password, useSalt, PBKDF2_ITERATIONS, 64, "sha512")
		.toString("hex");
	return { hash, salt: useSalt };
}

export function verifyPassword(
	password: string,
	storedHash: string,
	salt: string,
): { valid: boolean; needsUpgrade: boolean } {
	const newHash = crypto
		.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 64, "sha512")
		.toString("hex");
	if (newHash === storedHash) return { valid: true, needsUpgrade: false };

	const oldHash = crypto
		.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS_OLD, 64, "sha512")
		.toString("hex");
	if (oldHash === storedHash) return { valid: true, needsUpgrade: true };

	return { valid: false, needsUpgrade: false };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm test -- src/server/services/security.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/server/services/security.ts src/server/services/security.test.ts
git commit -m "feat: security 服务(哈希/slug/密码强度/常量)"
```

---

### Task 4: session 服务(DB 落库)+ cookie 工具

**Files:**
- Create: `src/server/services/session.ts`
- Test: `src/server/services/session.test.ts`

**Interfaces:**
- Consumes: `getDb`(Task 2)、`SESSION_TTL_MS`(Task 3)
- Produces:
  - `createSession(username: string, ip?: string, userAgent?: string): Promise<string>`(返回原始 token,库里存 sha256)
  - `validateSession(token: string): Promise<string | null>`(过期自动删除)
  - `revokeSession(token: string): Promise<void>`
  - `setSessionCookie(c: Context, token: string): void`、`clearSessionCookie(c: Context): void`(Hono Context,cookie 名 `fuwari_session`,HttpOnly/SameSite=Strict/Path=/,非 dev 加 Secure,Max-Age 86400/0)
  - `getTokenFromRequest(req: Request): string | null`(cookie 优先,`Authorization: Bearer` 兜底)
  - `getClientIp(req: Request): string`(`x-forwarded-for` 首段 → `x-real-ip` → `"unknown"`)

- [ ] **Step 1: 写失败测试**

`src/server/services/session.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { ensureSchema, setDb } from "../db";
import { createSession, validateSession, revokeSession } from "./session";

describe("session service", () => {
	beforeEach(async () => {
		setDb(drizzle(new Database(":memory:")));
		await ensureSchema(drizzle(new Database(":memory:"))); // 注意:见下方实现说明
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
		// 手工把过期时间改到过去
		const { db, t } = await getDb();
		await db.update(t.sessions).set({ expiresAt: "2000-01-01T00:00:00Z" });
		expect(await validateSession(token)).toBeNull();
	});
});
```

注意 beforeEach 里两次 `new Database(":memory:")` 是 bug 示例——正确写法:

```ts
beforeEach(async () => {
	const sqlite = new Database(":memory:");
	const db = drizzle(sqlite);
	await ensureSchema(db);
	setDb(db);
});
```

并在测试顶部 `import { getDb } from "../db";`。

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test -- src/server/services/session.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

`src/server/services/session.ts`:

```ts
import { createHash, randomUUID } from "node:crypto";
import { eq, lt } from "drizzle-orm";
import { deleteCookie, setCookie, getCookie } from "hono/cookie";
import type { Context } from "hono";
import { getDb } from "../db";
import { SESSION_TTL_MS } from "./security";

const SESSION_COOKIE_NAME = "fuwari_session";

function sha256(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

export async function createSession(
	username: string,
	ip?: string,
	userAgent?: string,
): Promise<string> {
	const token = randomUUID();
	const now = new Date();
	const expires = new Date(now.getTime() + SESSION_TTL_MS);
	const { db, t } = await getDb();

	await db.delete(t.sessions).where(lt(t.sessions.expiresAt, now.toISOString()));
	await db.insert(t.sessions).values({
		tokenHash: sha256(token),
		username,
		createdAt: now.toISOString(),
		expiresAt: expires.toISOString(),
		ip: ip ?? null,
		userAgent: userAgent ?? null,
	});
	return token;
}

export async function validateSession(token: string): Promise<string | null> {
	const { db, t } = await getDb();
	const rows = await db
		.select()
		.from(t.sessions)
		.where(eq(t.sessions.tokenHash, sha256(token)))
		.limit(1);
	const row = rows[0];
	if (!row) return null;
	if (Date.parse(row.expiresAt) <= Date.now()) {
		await db.delete(t.sessions).where(eq(t.sessions.tokenHash, sha256(token)));
		return null;
	}
	return row.username;
}

export async function revokeSession(token: string): Promise<void> {
	const { db, t } = await getDb();
	await db.delete(t.sessions).where(eq(t.sessions.tokenHash, sha256(token)));
}

export function setSessionCookie(c: Context, token: string): void {
	setCookie(c, SESSION_COOKIE_NAME, token, {
		httpOnly: true,
		sameSite: "Strict",
		path: "/",
		maxAge: 86400,
		secure: !import.meta.env?.DEV,
	});
}

export function clearSessionCookie(c: Context): void {
	deleteCookie(c, SESSION_COOKIE_NAME, {
		httpOnly: true,
		sameSite: "Strict",
		path: "/",
		maxAge: 0,
		secure: !import.meta.env?.DEV,
	});
}

export function getTokenFromRequest(req: Request): string | null {
	const cookieHeader = req.headers.get("cookie");
	if (cookieHeader) {
		const match = cookieHeader.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
		if (match) return match[1];
	}
	const authHeader = req.headers.get("Authorization");
	if (authHeader?.startsWith("Bearer ")) return authHeader.substring(7);
	return null;
}

export function getClientIp(req: Request): string {
	return (
		req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
		req.headers.get("x-real-ip") ||
		"unknown"
	);
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm test -- src/server/services/session.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/server/services/session.ts src/server/services/session.test.ts
git commit -m "feat: session 落库服务与 cookie 工具"
```

---

### Task 5: DB 限速服务(固定窗口)

**Files:**
- Create: `src/server/services/rate-limit.ts`
- Test: `src/server/services/rate-limit.test.ts`

**Interfaces:**
- Produces: `checkRateLimit(key: string, maxAttempts: number, windowMs: number): Promise<{ allowed: boolean; retryAfter?: number }>`(`retryAfter` 单位秒)

- [ ] **Step 1: 写失败测试**

`src/server/services/rate-limit.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { ensureSchema, getDb, setDb } from "../db";
import { checkRateLimit } from "./rate-limit";

describe("rate limiter", () => {
	beforeEach(async () => {
		const sqlite = new Database(":memory:");
		const db = drizzle(sqlite);
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
		await db.update(t.rateLimits).set({ windowExpiresAt: "2000-01-01T00:00:00Z" }).where(eq(t.rateLimits.key, "k"));
		expect((await checkRateLimit("k", 1, 60_000)).allowed).toBe(true);
	});
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test -- src/server/services/rate-limit.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

`src/server/services/rate-limit.ts`:

```ts
import { eq } from "drizzle-orm";
import { getDb } from "../db";

export async function checkRateLimit(
	key: string,
	maxAttempts: number,
	windowMs: number,
): Promise<{ allowed: boolean; retryAfter?: number }> {
	const { db, t } = await getDb();
	const now = Date.now();

	const rows = await db
		.select()
		.from(t.rateLimits)
		.where(eq(t.rateLimits.key, key))
		.limit(1);
	const row = rows[0];

	if (!row || Date.parse(row.windowExpiresAt) <= now) {
		const windowExpiresAt = new Date(now + windowMs).toISOString();
		await db
			.insert(t.rateLimits)
			.values({ key, count: 1, windowExpiresAt })
			.onConflictDoUpdate({
				target: t.rateLimits.key,
				set: { count: 1, windowExpiresAt },
			});
		return { allowed: true };
	}

	if (row.count >= maxAttempts) {
		return {
			allowed: false,
			retryAfter: Math.ceil((Date.parse(row.windowExpiresAt) - now) / 1000),
		};
	}

	await db
		.update(t.rateLimits)
		.set({ count: row.count + 1 })
		.where(eq(t.rateLimits.key, key));
	return { allowed: true };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm test -- src/server/services/rate-limit.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/server/services/rate-limit.ts src/server/services/rate-limit.test.ts
git commit -m "feat: 数据库固定窗口限速服务"
```

---

### Task 6: 响应封装 + requireAuth 中间件

**Files:**
- Create: `src/server/http.ts`、`src/server/middleware/auth.ts`
- Test: `src/server/middleware/auth.test.ts`

**Interfaces:**
- Consumes: `validateSession`、`getTokenFromRequest`(Task 4)
- Produces:
  - `ok<T>(c: Context, data: T, status?: number): Response` → `{ ok: true, data }`
  - `fail(c: Context, status: number, code: string, message: string, extra?: Record<string, unknown>): Response` → `{ ok: false, error: { code, message, ...extra } }`
  - `requireAuth`(Hono 中间件,校验失败返回 401 封装;成功 `c.set("username", ...)`)
  - `AppEnv`(Task 1 已定义;本任务在 http.ts 中 re-export)

- [ ] **Step 1: 写失败测试**

`src/server/middleware/auth.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { Hono } from "hono";
import { ensureSchema, setDb } from "../db";
import { createSession } from "../services/session";
import { requireAuth } from "./auth";

const app = new Hono();
app.use("/protected/*", requireAuth);
app.get("/protected/whoami", (c) => c.json({ username: c.get("username") }));

describe("requireAuth middleware", () => {
	beforeEach(async () => {
		const sqlite = new Database(":memory:");
		const db = drizzle(sqlite);
		await ensureSchema(db);
		setDb(db);
	});

	it("rejects without token with 401 envelope", async () => {
		const res = await app.request("/protected/whoami");
		expect(res.status).toBe(401);
		const body = await res.json();
		expect(body).toEqual({ ok: false, error: { code: "unauthorized", message: "Unauthorized" } });
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
		const { revokeSession } = await import("../services/session");
		await revokeSession(token);
		const res = await app.request("/protected/whoami", {
			headers: { cookie: `fuwari_session=${token}` },
		});
		expect(res.status).toBe(401);
	});
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test -- src/server/middleware/auth.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

`src/server/http.ts`:

```ts
import type { Context } from "hono";
import type { AppEnv } from "./app";

export type { AppEnv };

export function ok<T>(c: Context, data: T, status = 200) {
	return c.json({ ok: true, data }, status);
}

export function fail(
	c: Context,
	status: number,
	code: string,
	message: string,
	extra?: Record<string, unknown>,
) {
	return c.json({ ok: false, error: { code, message, ...(extra ?? {}) } }, status);
}
```

`src/server/middleware/auth.ts`:

```ts
import { createMiddleware } from "hono/factory";
import { fail, type AppEnv } from "../http";
import { getTokenFromRequest, validateSession } from "../services/session";

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
	const token = getTokenFromRequest(c.req.raw);
	const username = token ? await validateSession(token) : null;
	if (!username) {
		return fail(c, 401, "unauthorized", "Unauthorized");
	}
	c.set("username", username);
	await next();
});
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm test -- src/server/middleware/auth.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/server/http.ts src/server/middleware
git commit -m "feat: 统一响应封装与 requireAuth 中间件"
```

---

### Task 7: admins 数据仓库

**Files:**
- Create: `src/server/services/admins-repo.ts`、`src/server/db/testing.ts`
- Test: `src/server/services/admins-repo.test.ts`

**Interfaces:**
- Consumes: `getDb`(Task 2)、`hashPassword`/`verifyPassword`/`validatePasswordStrength`(Task 3)
- Produces(全部函数签名与旧 `stats-db.ts` 对齐,`initTestDb` 除外):
  - `ensureDefaultAdmin(): Promise<void>`(dev 或 `CREATE_DEFAULT_ADMIN=true` 时创建 `admin/admin12345678`)
  - `createAdmin(username, password): Promise<boolean>`(强度不足抛 Error;重复用户名返回 false)
  - `verifyAdmin(username, password): Promise<boolean>`(旧参数哈希透明升级)
  - `listAdmins(): Promise<{ id; username; email; createdAt }[]>`
  - `changePassword(username, newPassword): Promise<boolean>`
  - `deleteAdmin(username): Promise<boolean>`(最后一个管理员拒删)
  - `getAdminEmail(username): Promise<string | null>` / `setAdminEmail(username, email): Promise<boolean>`
  - `storeResetToken(username, token, expiresAt: Date): Promise<boolean>`
  - `consumeResetToken(token): Promise<string | null>`(JS 侧过期判断,兼容旧 ISO 格式)
  - `clearResetToken(username): Promise<boolean>`
  - `countAdmins(): Promise<number>`
  - `initTestDb(): Promise<void>`(testing.ts;`:memory:` + ensureSchema + ensureDefaultAdmin)

- [ ] **Step 1: 写失败测试(移植旧 admin-db.test.ts 全部场景 + token 流程)**

`src/server/services/admins-repo.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { initTestDb } from "../db/testing";
import {
	createAdmin, verifyAdmin, listAdmins, changePassword, deleteAdmin,
	getAdminEmail, setAdminEmail, storeResetToken, consumeResetToken,
} from "./admins-repo";

beforeEach(async () => {
	await initTestDb();
});

describe("admins repo", () => {
	it("creates default admin", async () => {
		const admins = await listAdmins();
		expect(admins).toHaveLength(1);
		expect(admins[0].username).toBe("admin");
	});

	it("verifies credentials incl. wrong password and unknown user", async () => {
		expect(await verifyAdmin("admin", "admin12345678")).toBe(true);
		expect(await verifyAdmin("admin", "wrongpassword1")).toBe(false);
		expect(await verifyAdmin("nobody", "admin12345678")).toBe(false);
	});

	it("create/verify/duplicate", async () => {
		expect(await createAdmin("u1", "password12345")).toBe(true);
		expect(await createAdmin("u1", "password12345")).toBe(false);
		await expect(createAdmin("u2", "short")).rejects.toThrow("密码长度");
		expect(await verifyAdmin("u1", "password12345")).toBe(true);
	});

	it("change password", async () => {
		await createAdmin("u1", "password12345");
		expect(await changePassword("u1", "newpassword123")).toBe(true);
		expect(await verifyAdmin("u1", "newpassword123")).toBe(true);
		expect(await changePassword("ghost", "newpassword123")).toBe(false);
	});

	it("delete admin + last-admin guard", async () => {
		await createAdmin("u1", "password12345");
		expect(await deleteAdmin("u1")).toBe(true);
		expect(await deleteAdmin("admin")).toBe(false); // 最后一个
	});

	it("list admins has no password fields", async () => {
		await createAdmin("u1", "password12345");
		const admins = await listAdmins();
		for (const a of admins) {
			expect(a).not.toHaveProperty("passwordHash");
			expect(a).not.toHaveProperty("passwordSalt");
		}
	});

	it("email set/get", async () => {
		expect(await setAdminEmail("admin", "a@b.com")).toBe(true);
		expect(await getAdminEmail("admin")).toBe("a@b.com");
		expect(await getAdminEmail("ghost")).toBeNull();
	});

	it("reset token store/consume/expiry", async () => {
		await setAdminEmail("admin", "a@b.com");
		const future = new Date(Date.now() + 30 * 60 * 1000);
		expect(await storeResetToken("admin", "tok", future)).toBe(true);
		expect(await consumeResetToken("tok")).toBe("admin");
		expect(await consumeResetToken("tok")).toBeNull(); // 已消费

		await storeResetToken("admin", "tok2", new Date(Date.now() - 1000));
		expect(await consumeResetToken("tok2")).toBeNull(); // 已过期
	});
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test -- src/server/services/admins-repo.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

`src/server/db/testing.ts`:

```ts
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { ensureSchema, setDb } from "./index";
import { ensureDefaultAdmin } from "../services/admins-repo";

export async function initTestDb(): Promise<void> {
	const sqlite = new Database(":memory:");
	const db = drizzle(sqlite);
	await ensureSchema(db);
	setDb(db);
	await ensureDefaultAdmin();
}
```

`src/server/services/admins-repo.ts`(行为逐条对齐旧 `db-sqlite.ts`;时间值统一存 ISO 字符串,过期判断在 JS 侧做以兼容两个方言与旧数据):

```ts
import { eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { hashPassword, verifyPassword, validatePasswordStrength } from "./security";

export async function ensureDefaultAdmin(): Promise<void> {
	const isDev = typeof import.meta !== "undefined" && import.meta.env?.DEV;
	const allowDefault = isDev || process.env.CREATE_DEFAULT_ADMIN === "true";
	if (!allowDefault) {
		console.warn(
			"[DB] Skipping default admin creation in production. Set CREATE_DEFAULT_ADMIN=true to enable.",
		);
		return;
	}
	const { db, t } = await getDb();
	const existing = await db
		.select({ id: t.admins.id })
		.from(t.admins)
		.where(eq(t.admins.username, "admin"))
		.limit(1);
	if (existing.length === 0) {
		const { hash, salt } = hashPassword("admin12345678");
		await db
			.insert(t.admins)
			.values({ username: "admin", passwordHash: hash, passwordSalt: salt });
	}
}

export async function createAdmin(
	username: string,
	password: string,
): Promise<boolean> {
	const strengthCheck = validatePasswordStrength(password);
	if (!strengthCheck.valid) {
		throw new Error(strengthCheck.error);
	}
	const { db, t } = await getDb();
	const { hash, salt } = hashPassword(password);
	try {
		await db
			.insert(t.admins)
			.values({ username, passwordHash: hash, passwordSalt: salt });
		return true;
	} catch {
		return false; // 用户名已存在
	}
}

export async function verifyAdmin(
	username: string,
	password: string,
): Promise<boolean> {
	const { db, t } = await getDb();
	const rows = await db
		.select()
		.from(t.admins)
		.where(eq(t.admins.username, username))
		.limit(1);
	const row = rows[0];
	if (!row) return false;
	const { valid, needsUpgrade } = verifyPassword(
		password,
		row.passwordHash,
		row.passwordSalt,
	);
	if (valid && needsUpgrade) {
		const upgraded = hashPassword(password, row.passwordSalt);
		await db
			.update(t.admins)
			.set({ passwordHash: upgraded.hash })
			.where(eq(t.admins.username, username));
	}
	return valid;
}

function normalizeDatetime(value: string): string {
	return String(value).replace("T", " ").slice(0, 19);
}

export async function listAdmins(): Promise<
	{ id: number; username: string; email: string; createdAt: string }[]
> {
	const { db, t } = await getDb();
	const rows = await db.select().from(t.admins).orderBy(t.admins.id);
	return rows.map((r) => ({
		id: r.id,
		username: r.username,
		email: r.email || "",
		createdAt: normalizeDatetime(r.createdAt),
	}));
}

export async function countAdmins(): Promise<number> {
	const { db, t } = await getDb();
	const rows = await db
		.select({ count: sql<number>`count(*)` })
		.from(t.admins);
	return Number(rows[0].count);
}

export async function changePassword(
	username: string,
	newPassword: string,
): Promise<boolean> {
	const strengthCheck = validatePasswordStrength(newPassword);
	if (!strengthCheck.valid) {
		throw new Error(strengthCheck.error);
	}
	const { db, t } = await getDb();
	const { hash, salt } = hashPassword(newPassword);
	const result = await db
		.update(t.admins)
		.set({ passwordHash: hash, passwordSalt: salt })
		.where(eq(t.admins.username, username))
		.returning({ id: t.admins.id });
	return result.length > 0;
}

export async function deleteAdmin(username: string): Promise<boolean> {
	if ((await countAdmins()) <= 1) return false;
	const { db, t } = await getDb();
	const result = await db
		.delete(t.admins)
		.where(eq(t.admins.username, username))
		.returning({ id: t.admins.id });
	return result.length > 0;
}

export async function getAdminEmail(username: string): Promise<string | null> {
	const { db, t } = await getDb();
	const rows = await db
		.select({ email: t.admins.email })
		.from(t.admins)
		.where(eq(t.admins.username, username))
		.limit(1);
	return rows[0]?.email || null;
}

export async function setAdminEmail(
	username: string,
	email: string,
): Promise<boolean> {
	const { db, t } = await getDb();
	const result = await db
		.update(t.admins)
		.set({ email })
		.where(eq(t.admins.username, username))
		.returning({ id: t.admins.id });
	return result.length > 0;
}

export async function storeResetToken(
	username: string,
	token: string,
	expiresAt: Date,
): Promise<boolean> {
	const { db, t } = await getDb();
	const result = await db
		.update(t.admins)
		.set({ resetToken: token, resetTokenExpires: expiresAt.toISOString() })
		.where(eq(t.admins.username, username))
		.returning({ id: t.admins.id });
	return result.length > 0;
}

export async function consumeResetToken(token: string): Promise<string | null> {
	const { db, t } = await getDb();
	const rows = await db
		.select()
		.from(t.admins)
		.where(eq(t.admins.resetToken, token))
		.limit(1);
	const row = rows[0];
	if (!row) return null;
	if (!row.resetTokenExpires || Date.parse(row.resetTokenExpires) <= Date.now()) {
		return null;
	}
	await db
		.update(t.admins)
		.set({ resetToken: "", resetTokenExpires: null })
		.where(eq(t.admins.id, row.id));
	return row.username;
}

export async function clearResetToken(username: string): Promise<boolean> {
	const { db, t } = await getDb();
	const result = await db
		.update(t.admins)
		.set({ resetToken: "", resetTokenExpires: null })
		.where(eq(t.admins.username, username))
		.returning({ id: t.admins.id });
	return result.length > 0;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm test -- src/server/services/admins-repo.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/server/services/admins-repo.ts src/server/services/admins-repo.test.ts src/server/db/testing.ts
git commit -m "feat: admins 数据仓库(Drizzle)"
```

---

### Task 8: captcha / email / config-store 服务移植

**Files:**
- Create: `src/server/services/config-store.ts`、`src/server/services/captcha.ts`、`src/server/services/email.ts`
- Test: `src/server/services/captcha.test.ts`

**Interfaces:**
- Consumes: `getMergedConfig()`(本任务产出)
- Produces:
  - config-store: `readOverrides(): Record<string, unknown>`、`writeOverrides(config): void`、`getMergedConfig(): Promise<Record<string, unknown>>`(行为同旧版;路径改为 `process.env.CONFIG_OVERRIDES_PATH || data/config-overrides.json`,**每次调用时读取**)
  - captcha: `CaptchaInfo`、`CaptchaVerificationError`、`getCaptchaProvider(): Promise<"turnstile"|"hcaptcha"|"none">`、`getCaptchaSecretKey(): Promise<string>`、`verifyCaptcha(token, context)`、`buildCaptchaInfo(): Promise<CaptchaInfo>`、`mapCaptchaErrorCode(provider, errorCode)`(其余旧导出可删)
  - email: `sendResetEmail(to, resetUrl): Promise<boolean>`

- [ ] **Step 1: 移植 config-store**

复制 `src/utils/admin/config-store.ts` → `src/server/services/config-store.ts`,仅改两处:

```ts
// 旧:
const OVERRIDES_PATH = path.join(process.cwd(), "data", "config-overrides.json");
// 新(每次调用读取,支持测试注入):
function getOverridesPath(): string {
	return process.env.CONFIG_OVERRIDES_PATH || path.join(process.cwd(), "data", "config-overrides.json");
}
```

`readOverrides`/`writeOverrides` 内的 `OVERRIDES_PATH` 全部替换为 `getOverridesPath()`;动态导入改为 `await import("../../config.ts")`(从 `src/server/services/` 到 `src/config.ts` 仍是 `../../config.ts`,不变);`deepMerge` 原样保留。

- [ ] **Step 2: 移植 captcha**

复制 `src/utils/admin/captcha.ts` → `src/server/services/captcha.ts`,仅改:

1. `import { getMergedConfig } from "./config-store.js"` → `from "./config-store"`
2. 删除未被任何调用方使用的导出:`buildCaptchaErrorInfo`(`isCaptchaEnabled`、`getCaptchaSiteKey` 被 `buildCaptchaInfo`/`verifyCaptcha` 内部使用,保留但不导出或照旧导出均可——照旧保留导出,减少 diff)
3. 其余逐行保留(错误映射、防枚举消息、Turnstile/hCaptcha siteverify 端点、错误码映射全部不变)

- [ ] **Step 3: 移植 email**

复制 `src/utils/admin/email.ts` → `src/server/services/email.ts`,逐行保留(Resend 降级 console.log 行为不变)。

- [ ] **Step 4: 写 captcha 测试**

`src/server/services/captcha.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildCaptchaInfo, getCaptchaProvider, mapCaptchaErrorCode, verifyCaptcha } from "./captcha";

// vitest.setup.ts 已把 CONFIG_OVERRIDES_PATH 指向 provider=none 的临时文件

describe("captcha service", () => {
	it("resolves provider from overrides (none in tests)", async () => {
		expect(await getCaptchaProvider()).toBe("none");
	});

	it("buildCaptchaInfo disabled when provider none", async () => {
		expect(await buildCaptchaInfo()).toEqual({ enabled: false, provider: "none", siteKey: "" });
	});

	it("verifyCaptcha is a no-op when disabled", async () => {
		const ctx = { captchaInfo: await buildCaptchaInfo() };
		await expect(verifyCaptcha("", ctx)).resolves.toBe(ctx);
	});

	it("maps turnstile error codes", () => {
		expect(mapCaptchaErrorCode("turnstile", "timeout-or-duplicate")).toMatchObject({
			type: "timeout",
			retryable: true,
		});
		expect(mapCaptchaErrorCode("hcaptcha", "challenge-closed")).toMatchObject({
			type: "invalid_token",
		});
		expect(mapCaptchaErrorCode("turnstile")).toEqual({
			type: "unknown",
			message: "验证码验证失败",
			retryable: true,
		});
	});
});
```

- [ ] **Step 5: 跑测试**

Run: `pnpm test -- src/server/services/captcha.test.ts`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add src/server/services/config-store.ts src/server/services/captcha.ts src/server/services/email.ts src/server/services/captcha.test.ts
git commit -m "feat: captcha/email/config-store 服务移植"
```

---

### Task 9: stats 仓库

**Files:**
- Create: `src/server/services/stats-repo.ts`
- Test: `src/server/services/stats-repo.test.ts`

**Interfaces:**
- Consumes: `getDb`、`getDialect`(Task 2)
- Produces:
  - `recordVisit(pagePath: string): Promise<void>`、`recordArticleView(slug: string): Promise<void>`
  - `getStats(range: "7d" | "30d" | "all"): Promise<{ totalPageViews: number; totalArticleViews: number; dailyViews: { date: string; count: number }[]; topArticles: { slug: string; count: number }[] }>`

- [ ] **Step 1: 写失败测试**

`src/server/services/stats-repo.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { ensureSchema, setDb } from "../db";
import { getStats, recordArticleView, recordVisit } from "./stats-repo";

function daysAgo(n: number): string {
	return new Date(Date.now() - n * 86_400_000)
		.toISOString()
		.replace("T", " ")
		.slice(0, 19);
}

describe("stats repo", () => {
	beforeEach(async () => {
		const sqlite = new Database(":memory:");
		const db = drizzle(sqlite);
		await ensureSchema(db);
		setDb(db);
	});

	it("records and counts visits", async () => {
		await recordVisit("/");
		await recordVisit("/about");
		await recordArticleView("hello-world");
		const stats = await getStats("all");
		expect(stats.totalPageViews).toBe(2);
		expect(stats.totalArticleViews).toBe(1);
		expect(stats.topArticles).toEqual([{ slug: "hello-world", count: 1 }]);
	});

	it("range filters exclude old rows", async () => {
		const { db, t } = await import("../db").then((m) => m.getDb());
		await db.insert(t.pageViews).values([
			{ path: "/old", visitedAt: daysAgo(20) },
			{ path: "/new", visitedAt: daysAgo(1) },
		]);
		await db.insert(t.articleViews).values([
			{ slug: "old-post", visitedAt: daysAgo(20) },
			{ slug: "new-post", visitedAt: daysAgo(1) },
			{ slug: "new-post", visitedAt: daysAgo(2) },
		]);

		const week = await getStats("7d");
		expect(week.totalPageViews).toBe(1);
		expect(week.totalArticleViews).toBe(2);

		const month = await getStats("30d");
		expect(month.totalPageViews).toBe(2);
		expect(month.totalArticleViews).toBe(3);

		const all = await getStats("all");
		expect(all.totalPageViews).toBe(2);
	});

	it("dailyViews merges page+article counts by date", async () => {
		const { db, t } = await import("../db").then((m) => m.getDb());
		const today = daysAgo(0);
		await db.insert(t.pageViews).values([
			{ path: "/a", visitedAt: today },
			{ path: "/b", visitedAt: today },
		]);
		await db.insert(t.articleViews).values({ slug: "s", visitedAt: today });
		const stats = await getStats("7d");
		const todayEntry = stats.dailyViews.find((d) => d.count === 3);
		expect(todayEntry).toBeTruthy();
		expect(todayEntry?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test -- src/server/services/stats-repo.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

`src/server/services/stats-repo.ts`(天数分组按方言选表达式;日聚合在 JS 合并,避免跨表 UNION):

```ts
import { sql, type SQL } from "drizzle-orm";
import { getDb, getDialect } from "../db";

export type StatsRange = "7d" | "30d" | "all";

export type StatsResult = {
	totalPageViews: number;
	totalArticleViews: number;
	dailyViews: { date: string; count: number }[];
	topArticles: { slug: string; count: number }[];
};

function nowSqlDatetime(): string {
	return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function cutoffSqlDatetime(range: StatsRange): string | null {
	if (range === "all") return null;
	const days = range === "7d" ? 7 : 30;
	return new Date(Date.now() - days * 86_400_000)
		.toISOString()
		.replace("T", " ")
		.slice(0, 19);
}

function dayExpr(col: SQL.Aliased | any, column: any): SQL<string> {
	return getDialect() === "postgres"
		? sql<string>`to_char(${column}, 'YYYY-MM-DD')`
		: sql<string>`date(${column})`;
}

export async function recordVisit(pagePath: string): Promise<void> {
	const { db, t } = await getDb();
	await db.insert(t.pageViews).values({ path: pagePath, visitedAt: nowSqlDatetime() });
}

export async function recordArticleView(slug: string): Promise<void> {
	const { db, t } = await getDb();
	await db.insert(t.articleViews).values({ slug, visitedAt: nowSqlDatetime() });
}

async function dailyFrom(
	table: "pageViews" | "articleViews",
	cutoff: string | null,
): Promise<{ date: string; count: number }[]> {
	const { db, t } = await getDb();
	const col = table === "pageViews" ? t.pageViews.visitedAt : t.articleViews.visitedAt;
	const expr = dayExpr(null, col).as("date");
	const query = db
		.select({ date: expr, count: sql<number>`count(*)`.as("count") })
		.from(table === "pageViews" ? t.pageViews : t.articleViews)
		.groupBy(sql`1`);
	// cutoff 过滤
	const rows = cutoff
		? await db
				.select({ date: expr, count: sql<number>`count(*)`.as("count") })
				.from(table === "pageViews" ? t.pageViews : t.articleViews)
				.where(sql`${col} >= ${cutoff}`)
				.groupBy(sql`1`)
		: await query.all?.() ?? await query;
	return rows.map((r) => ({ date: String(r.date), count: Number(r.count) }));
}

export async function getStats(range: StatsRange): Promise<StatsResult> {
	const { db, t } = await getDb();
	const cutoff = cutoffSqlDatetime(range);

	const pageFilter = cutoff ? sql`${t.pageViews.visitedAt} >= ${cutoff}` : undefined;
	const articleFilter = cutoff ? sql`${t.articleViews.visitedAt} >= ${cutoff}` : undefined;

	const pageCount = await db
		.select({ count: sql<number>`count(*)` })
		.from(t.pageViews)
		.where(pageFilter);
	const articleCount = await db
		.select({ count: sql<number>`count(*)` })
		.from(t.articleViews)
		.where(articleFilter);

	const [dailyPages, dailyArticles] = await Promise.all([
		dailyFrom("pageViews", cutoff),
		dailyFrom("articleViews", cutoff),
	]);

	const merged = new Map<string, number>();
	for (const { date, count } of [...dailyPages, ...dailyArticles]) {
		merged.set(date, (merged.get(date) ?? 0) + count);
	}
	const dailyViews = [...merged.entries()]
		.map(([date, count]) => ({ date, count }))
		.sort((a, b) => (a.date > b.date ? 1 : -1));

	const topArticles = (
		await db
			.select({ slug: t.articleViews.slug, count: sql<number>`count(*)`.as("count") })
			.from(t.articleViews)
			.where(articleFilter)
			.groupBy(t.articleViews.slug)
			.orderBy(sql`count(*) desc`)
			.limit(10)
	).map((r) => ({ slug: r.slug, count: Number(r.count) }));

	return {
		totalPageViews: Number(pageCount[0].count),
		totalArticleViews: Number(articleCount[0].count),
		dailyViews,
		topArticles,
	};
}
```

(实现时把 `dailyFrom` 里重复的 select 简化为一个带可选 where 的查询构建器——上面示意有冗余分支,以测试通过为准;`groupBy(sql\`1\`)` 两个方言都支持按位置分组)

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm test -- src/server/services/stats-repo.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/server/services/stats-repo.ts src/server/services/stats-repo.test.ts
git commit -m "feat: 统计仓库(Drizzle,日聚合 JS 合并)"
```

---

### Task 10: post-files 服务移植

**Files:**
- Create: `src/server/services/post-files.ts`
- Test: `src/server/services/post-files.test.ts`

**Interfaces:**
- Produces(与旧 `file-ops.ts` 相同):`PostFrontmatter`、`PostMeta`、`PostDetail` 类型;`listPosts(): PostMeta[]`、`readPost(slug): PostDetail | null`、`createPost(slug, frontmatter, content): void`、`writePost(slug, frontmatter, content): void`、`deletePost(slug): boolean`。文章目录改为 `getPostsDir(): string`(`process.env.POSTS_DIR || cwd/src/content/posts`,**每次调用读取**)

- [ ] **Step 1: 写失败测试**

`src/server/services/post-files.test.ts`:

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
	createPost, deletePost, listPosts, readPost, writePost,
} from "./post-files";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fuwari-posts-"));

beforeAll(() => {
	process.env.POSTS_DIR = dir;
});

describe("post files", () => {
	it("create → read → list roundtrip", () => {
		createPost("my-post", { title: "标题", published: "2026-10-07", tags: ["a"] }, "# hello");
		const post = readPost("my-post");
		expect(post?.title).toBe("标题");
		expect(post?.content.trim()).toBe("# hello");
		expect(post?.tags).toEqual(["a"]);
		expect(listPosts()).toHaveLength(1);
	});

	it("rejects duplicate slug", () => {
		expect(() => createPost("my-post", { title: "x", published: "2026-10-07" }, "")).toThrow(
			/already exists/,
		);
	});

	it("rejects invalid slug", () => {
		expect(() => readPost("../evil")).toThrow(/Invalid slug/);
	});

	it("write updates content", () => {
		writePost("my-post", { title: "新标题", published: "2026-10-07" }, "updated");
		expect(readPost("my-post")?.content).toBe("updated");
	});

	it("delete", () => {
		expect(deletePost("my-post")).toBe(true);
		expect(deletePost("my-post")).toBe(false);
	});
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test -- src/server/services/post-files.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

复制 `src/utils/admin/file-ops.ts` → `src/server/services/post-files.ts`,改动:

1. `import { validateSlug } from "./security"`(指向 Task 3)
2. `const POSTS_DIR = ...` 改为:

```ts
function getPostsDir(): string {
	return process.env.POSTS_DIR || path.join(process.cwd(), "src", "content", "posts");
}
```

3. 所有 `POSTS_DIR` 引用替换为 `getPostsDir()`
4. 其余逐行保留(接口、排序、gray-matter 读写行为不变)

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm test -- src/server/services/post-files.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/server/services/post-files.ts src/server/services/post-files.test.ts
git commit -m "feat: 文章文件服务移植(目录可注入)"
```

---

### Task 11: 认证路由

**Files:**
- Create: `src/server/routes/auth.ts`
- Modify: `src/server/app.ts`
- Test: `src/server/routes/auth.test.ts`

**Interfaces:**
- Consumes: 全部前置任务的服务;`initTestDb`、`apiApp`
- Produces(挂载后,通过 `apiApp.request()` 可达):
  - `POST /api/admin/auth`、`POST /api/admin/auth/forgot-password`、`POST /api/admin/auth/reset-password`、`POST /api/admin/logout`、`GET /api/admin/me`(requireAuth)、`GET /api/admin/captcha-config`

- [ ] **Step 1: 写失败测试**

`src/server/routes/auth.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { initTestDb } from "../db/testing";
import { apiApp } from "../app";
import { storeResetToken } from "../services/admins-repo";

const IP = { "x-forwarded-for": "9.9.9.9" };

beforeEach(async () => {
	await initTestDb();
});

function jsonInit(body: unknown, headers: Record<string, string> = {}): RequestInit {
	return {
		method: "POST",
		headers: { "Content-Type": "application/json", ...headers },
		body: JSON.stringify(body),
	};
}

describe("login", () => {
	it("rejects wrong credentials with 401 envelope and clears cookie", async () => {
		const res = await apiApp.request("/api/admin/auth", jsonInit({ username: "admin", password: "wrongpassword1" }, IP));
		expect(res.status).toBe(401);
		const body = await res.json();
		expect(body.ok).toBe(false);
		expect(body.error.message).toBe("用户名或密码错误");
		expect(res.headers.get("set-cookie")).toContain("fuwari_session=;");
	});

	it("logs in, sets cookie, me works, logout clears", async () => {
		const res = await apiApp.request("/api/admin/auth", jsonInit({ username: "admin", password: "admin12345678" }, IP));
		expect(res.status).toBe(200);
		expect((await res.json()).data.username).toBe("admin");
		const cookie = res.headers.get("set-cookie")!;
		expect(cookie).toContain("fuwari_session=");
		expect(cookie).toContain("HttpOnly");

		const me = await apiApp.request("/api/admin/me", { headers: { cookie } });
		expect(me.status).toBe(200);
		expect((await me.json()).data.username).toBe("admin");

		const logout = await apiApp.request("/api/admin/logout", { method: "POST", headers: { cookie } });
		expect(logout.status).toBe(200);
		const meAfter = await apiApp.request("/api/admin/me", { headers: { cookie } });
		expect(meAfter.status).toBe(401);
	});

	it("requires username and password", async () => {
		const res = await apiApp.request("/api/admin/auth", jsonInit({ username: "" }, IP));
		expect(res.status).toBe(400);
	});

	it("rate limits after 10 attempts per IP", async () => {
		for (let i = 0; i < 10; i++) {
			await apiApp.request("/api/admin/auth", jsonInit({ username: "admin", password: "wrongpassword1" }, IP));
		}
		const res = await apiApp.request("/api/admin/auth", jsonInit({ username: "admin", password: "admin12345678" }, IP));
		expect(res.status).toBe(429);
		expect((await res.json()).error.retryAfter).toBeGreaterThan(0);
	});
});

describe("me without auth", () => {
	it("returns 401", async () => {
		const res = await apiApp.request("/api/admin/me");
		expect(res.status).toBe(401);
	});
});

describe("captcha-config", () => {
	it("returns disabled info (provider none in tests)", async () => {
		const res = await apiApp.request("/api/admin/captcha-config");
		expect(res.status).toBe(200);
		expect((await res.json()).data).toEqual({ enabled: false, provider: "none", siteKey: "" });
	});
});

describe("forgot-password", () => {
	it("returns same message regardless of user existence", async () => {
		const existing = await apiApp.request("/api/admin/auth/forgot-password", jsonInit({ username: "admin" }, IP));
		const missing = await apiApp.request("/api/admin/auth/forgot-password", jsonInit({ username: "ghost" }, IP));
		expect(existing.status).toBe(200);
		expect(missing.status).toBe(200);
		expect((await existing.json()).data.message).toBe((await missing.json()).data.message);
	});

	it("rate limits after 3 attempts", async () => {
		for (let i = 0; i < 3; i++) {
			await apiApp.request("/api/admin/auth/forgot-password", jsonInit({ username: "admin" }, IP));
		}
		const res = await apiApp.request("/api/admin/auth/forgot-password", jsonInit({ username: "admin" }, IP));
		expect(res.status).toBe(429);
	});
});

describe("reset-password", () => {
	it("consumes valid token and changes password", async () => {
		await storeResetToken("admin", "tok123", new Date(Date.now() + 30 * 60 * 1000));
		const res = await apiApp.request("/api/admin/auth/reset-password", jsonInit({ token: "tok123", newPassword: "newpassword123" }));
		expect(res.status).toBe(200);

		const login = await apiApp.request("/api/admin/auth", jsonInit({ username: "admin", password: "newpassword123" }, { "x-forwarded-for": "8.8.8.8" }));
		expect(login.status).toBe(200);
	});

	it("rejects expired/invalid token", async () => {
		const res = await apiApp.request("/api/admin/auth/reset-password", jsonInit({ token: "nope", newPassword: "newpassword123" }));
		expect(res.status).toBe(400);
	});

	it("rejects weak password", async () => {
		await storeResetToken("admin", "tok456", new Date(Date.now() + 30 * 60 * 1000));
		const res = await apiApp.request("/api/admin/auth/reset-password", jsonInit({ token: "tok456", newPassword: "short" }));
		expect(res.status).toBe(400);
	});
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test -- src/server/routes/auth.test.ts`
Expected: FAIL(404 not_found)

- [ ] **Step 3: 实现路由并挂载**

`src/server/routes/auth.ts`:

```ts
import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../http";
import { fail, ok } from "../http";
import { requireAuth } from "../middleware/auth";
import {
	buildCaptchaInfo,
	CaptchaVerificationError,
	getCaptchaProvider,
	verifyCaptcha,
} from "../services/captcha";
import { sendResetEmail } from "../services/email";
import {
	changePassword,
	consumeResetToken,
	getAdminEmail,
	storeResetToken,
	verifyAdmin,
} from "../services/admins-repo";
import { checkRateLimit } from "../services/rate-limit";
import {
	RATE_LIMIT_MAX_ATTEMPTS,
	RATE_LIMIT_WINDOW_MS,
	validatePasswordStrength,
} from "../services/security";
import {
	clearSessionCookie,
	createSession,
	getClientIp,
	getTokenFromRequest,
	revokeSession,
	setSessionCookie,
} from "../services/session";

const LoginSchema = z.object({
	username: z.string().min(1),
	password: z.string().min(1),
	captchaToken: z.string().optional(),
});

const ForgotSchema = z.object({
	username: z.string().min(1),
	captchaToken: z.string().optional(),
});

const ResetSchema = z.object({
	token: z.string().min(1),
	newPassword: z.string().min(1),
});

async function verifyCaptchaOrThrow(token: string) {
	const provider = await getCaptchaProvider();
	if (provider === "none") return;
	try {
		const captchaInfo = await buildCaptchaInfo();
		await verifyCaptcha(token, { captchaInfo });
	} catch (err) {
		if (err instanceof CaptchaVerificationError) {
			return {
				status: 400 as const,
				payload: {
					code: "captcha_failed",
					message: err.message,
					captchaInfo: err.context.captchaInfo,
					captchaError: err.context.captchaError,
				},
			};
		}
		throw err;
	}
}

export const authRoutes = new Hono<AppEnv>();

authRoutes.post("/admin/auth", async (c) => {
	const ip = getClientIp(c.req.raw);
	const rl = await checkRateLimit(`login:${ip}`, RATE_LIMIT_MAX_ATTEMPTS, RATE_LIMIT_WINDOW_MS);
	if (!rl.allowed) {
		return fail(c, 429, "rate_limited", "Too many login attempts", {
			retryAfter: rl.retryAfter,
		});
	}

	const parsed = LoginSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) {
		return fail(c, 400, "invalid_request", "请输入用户名和密码");
	}
	const { username, password, captchaToken } = parsed.data;

	const captchaError = await verifyCaptchaOrThrow(captchaToken ?? "");
	if (captchaError) {
		return c.json({ ok: false, error: captchaError.payload }, captchaError.status);
	}

	const valid = await verifyAdmin(username, password);
	if (!valid) {
		clearSessionCookie(c);
		return fail(c, 401, "invalid_credentials", "用户名或密码错误");
	}

	const token = await createSession(username, ip, c.req.header("User-Agent") ?? undefined);
	setSessionCookie(c, token);
	return ok(c, { username });
});

authRoutes.post("/admin/auth/forgot-password", async (c) => {
	const ip = getClientIp(c.req.raw);
	const rl = await checkRateLimit(`forgot:${ip}`, 3, RATE_LIMIT_WINDOW_MS);
	if (!rl.allowed) {
		return fail(c, 429, "rate_limited", "请求过于频繁，请稍后再试", {
			retryAfter: rl.retryAfter,
		});
	}

	const parsed = ForgotSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) {
		return fail(c, 400, "invalid_request", "请输入用户名");
	}
	const { username, captchaToken } = parsed.data;

	const captchaError = await verifyCaptchaOrThrow(captchaToken ?? "");
	if (captchaError) {
		return c.json({ ok: false, error: captchaError.payload }, captchaError.status);
	}

	const email = await getAdminEmail(username);
	if (email) {
		const token = randomUUID();
		await storeResetToken(username, token, new Date(Date.now() + 30 * 60 * 1000));
		const siteUrl = process.env.SITE_URL || "http://localhost:4321";
		await sendResetEmail(email, `${siteUrl}/admin/reset-password/?token=${token}`);
	}

	return ok(c, { message: "如果该用户名存在，重置链接已发送到注册邮箱" });
});

authRoutes.post("/admin/auth/reset-password", async (c) => {
	const parsed = ResetSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) {
		return fail(c, 400, "invalid_request", "缺少必要参数");
	}
	const { token, newPassword } = parsed.data;

	const username = await consumeResetToken(token);
	if (!username) {
		return fail(c, 400, "invalid_token", "重置链接无效或已过期");
	}

	const strength = validatePasswordStrength(newPassword);
	if (!strength.valid) {
		return fail(c, 400, "weak_password", strength.error ?? "密码强度不足");
	}

	const changed = await changePassword(username, newPassword);
	if (!changed) {
		return fail(c, 500, "internal", "密码更新失败，请重试");
	}
	return ok(c, { message: "密码重置成功，请使用新密码登录" });
});

authRoutes.post("/admin/logout", async (c) => {
	const token = getTokenFromRequest(c.req.raw);
	if (token) await revokeSession(token);
	clearSessionCookie(c);
	return ok(c, { success: true });
});

authRoutes.get("/admin/me", requireAuth, (c) => ok(c, { username: c.get("username") }));

authRoutes.get("/admin/captcha-config", async (c) => ok(c, await buildCaptchaInfo()));
```

`src/server/app.ts` 中 `createServerApp` 内挂载(在 notFound 之前):

```ts
import { authRoutes } from "./routes/auth";
// ...
app.route("/", authRoutes);
```

同时在 `getDb()` 首次调用后初始化默认管理员——在 `app.ts` 顶部加一个惰性初始化(第一个请求触发):

```ts
let initialized = false;
async function ensureInit() {
	if (initialized) return;
	initialized = true;
	const { getDb } = await import("./db");
	const { ensureDefaultAdmin } = await import("./services/admins-repo");
	await getDb();
	await ensureDefaultAdmin();
}
// createServerApp 内:
app.use("*", async (_c, next) => { await ensureInit(); await next(); });
```

(测试中 `initTestDb` 已建默认管理员,`ensureInit` 再跑一次幂等无害)

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm test -- src/server/routes/auth.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/server/routes/auth.ts src/server/routes/auth.test.ts src/server/app.ts
git commit -m "feat: 认证路由(登录/忘记密码/重置/登出/me/验证码配置)"
```

---

### Task 12: posts 路由

**Files:**
- Create: `src/server/routes/posts.ts`
- Modify: `src/server/app.ts`
- Test: `src/server/routes/posts.test.ts`

**Interfaces:**
- Consumes: `requireAuth`、`ok/fail`、post-files 服务、`initTestDb`
- Produces: `GET/POST /api/admin/posts`、`GET/PUT/DELETE /api/admin/posts/:slug`(导出 `postsRoutes: Hono<AppEnv>`)

- [ ] **Step 1: 写失败测试**

`src/server/routes/posts.test.ts`:

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { apiApp } from "../app";
import { initTestDb } from "../db/testing";
import { createSession } from "../services/session";

let cookie = "";

beforeEach(async () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fuwari-posts-"));
	process.env.POSTS_DIR = dir;
	await initTestDb();
	const token = await createSession("admin");
	cookie = `fuwari_session=${token}`;
});

function auth(headers: Record<string, string> = {}): Record<string, string> {
	return { cookie, ...headers };
}

describe("posts routes", () => {
	it("requires auth", async () => {
		const res = await apiApp.request("/api/admin/posts");
		expect(res.status).toBe(401);
	});

	it("lists posts", async () => {
		const res = await apiApp.request("/api/admin/posts", { headers: auth() });
		expect(res.status).toBe(200);
		expect((await res.json()).data).toEqual([]);
	});

	it("creates, reads, updates, deletes", async () => {
		const create = await apiApp.request("/api/admin/posts", {
			method: "POST",
			headers: auth({ "Content-Type": "application/json" }),
			body: JSON.stringify({
				slug: "hello",
				title: "Hello",
				content: "# hi",
				frontmatter: { published: "2026-10-07", tags: ["x"] },
			}),
		});
		expect(create.status).toBe(201);

		const dup = await apiApp.request("/api/admin/posts", {
			method: "POST",
			headers: auth({ "Content-Type": "application/json" }),
			body: JSON.stringify({ slug: "hello", title: "Hello", content: "" }),
		});
		expect(dup.status).toBe(409);

		const get = await apiApp.request("/api/admin/posts/hello", { headers: auth() });
		expect((await get.json()).data.title).toBe("Hello");

		const put = await apiApp.request("/api/admin/posts/hello", {
			method: "PUT",
			headers: auth({ "Content-Type": "application/json" }),
			body: JSON.stringify({ content: "updated", frontmatter: { title: "Hello2", published: "2026-10-07" } }),
		});
		expect(put.status).toBe(200);

		const del = await apiApp.request("/api/admin/posts/hello", { method: "DELETE", headers: auth() });
		expect(del.status).toBe(200);
		expect((await apiApp.request("/api/admin/posts/hello", { headers: auth() })).status).toBe(404);
	});

	it("rejects invalid slug", async () => {
		const res = await apiApp.request("/api/admin/posts/Bad_Slug", { headers: auth() });
		expect(res.status).toBe(400);
	});

	it("rejects missing fields", async () => {
		const res = await apiApp.request("/api/admin/posts", {
			method: "POST",
			headers: auth({ "Content-Type": "application/json" }),
			body: JSON.stringify({ slug: "ok-slug" }),
		});
		expect(res.status).toBe(400);
	});
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test -- src/server/routes/posts.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

`src/server/routes/posts.ts`:

```ts
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../http";
import { fail, ok } from "../http";
import { requireAuth } from "../middleware/auth";
import {
	createPost,
	deletePost,
	listPosts,
	readPost,
	writePost,
	type PostFrontmatter,
} from "../services/post-files";
import { validateSlug } from "../services/security";

const CreatePostSchema = z.object({
	slug: z.string().min(1),
	title: z.string().min(1),
	content: z.string(),
	frontmatter: z.record(z.string(), z.unknown()).optional(),
});

const UpdatePostSchema = z.object({
	content: z.string(),
	frontmatter: z.record(z.string(), z.unknown()),
});

export const postsRoutes = new Hono<AppEnv>();

postsRoutes.get("/admin/posts", requireAuth, (c) => ok(c, listPosts()));

postsRoutes.post("/admin/posts", requireAuth, async (c) => {
	const parsed = CreatePostSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) {
		return fail(c, 400, "invalid_request", "Missing required fields: slug, title, content");
	}
	const { slug, title, content, frontmatter } = parsed.data;
	if (!validateSlug(slug)) {
		return fail(c, 400, "invalid_slug", "Invalid slug format");
	}
	try {
		createPost(slug, { title, ...(frontmatter ?? {}) } as PostFrontmatter, content);
	} catch (err) {
		if (err instanceof Error && err.message.includes("already exists")) {
			return fail(c, 409, "conflict", err.message);
		}
		throw err;
	}
	return c.json({ ok: true, data: { slug } }, 201);
});

postsRoutes.get("/admin/posts/:slug", requireAuth, (c) => {
	const slug = c.req.param("slug");
	if (!validateSlug(slug)) return fail(c, 400, "invalid_slug", "Invalid slug format");
	const post = readPost(slug);
	if (!post) return fail(c, 404, "not_found", "Post not found");
	return ok(c, post);
});

postsRoutes.put("/admin/posts/:slug", requireAuth, async (c) => {
	const slug = c.req.param("slug");
	if (!validateSlug(slug)) return fail(c, 400, "invalid_slug", "Invalid slug format");
	const parsed = UpdatePostSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) {
		return fail(c, 400, "invalid_request", "Missing required fields: content, frontmatter");
	}
	writePost(slug, parsed.data.frontmatter as PostFrontmatter, parsed.data.content);
	return ok(c, { slug });
});

postsRoutes.delete("/admin/posts/:slug", requireAuth, (c) => {
	const slug = c.req.param("slug");
	if (!validateSlug(slug)) return fail(c, 400, "invalid_slug", "Invalid slug format");
	const deleted = deletePost(slug);
	if (!deleted) return fail(c, 404, "not_found", "Post not found");
	return ok(c, { slug });
});
```

`app.ts` 挂载:`app.route("/", postsRoutes);`

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm test -- src/server/routes/posts.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/server/routes/posts.ts src/server/routes/posts.test.ts src/server/app.ts
git commit -m "feat: 文章路由(CRUD + slug 校验)"
```

---

### Task 13: admins / update-email / config 路由

**Files:**
- Create: `src/server/routes/admins.ts`、`src/server/routes/config.ts`
- Modify: `src/server/app.ts`
- Test: `src/server/routes/admins.test.ts`、`src/server/routes/config.test.ts`

**Interfaces:**
- Produces:
  - `GET/POST /api/admin/admins`、`PUT/DELETE /api/admin/admins/:username`、`POST /api/admin/update-email`(adminsRoutes)
  - `GET/PUT /api/admin/config`(configRoutes;PUT 白名单 key:site/navBar/profile/license/expressiveCode/aiSummary/captcha)

- [ ] **Step 1: 写失败测试**

`src/server/routes/admins.test.ts`:

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { apiApp } from "../app";
import { initTestDb } from "../db/testing";
import { createSession } from "../services/session";

let cookie = "";

beforeEach(async () => {
	process.env.CONFIG_OVERRIDES_PATH = path.join(
		fs.mkdtempSync(path.join(os.tmpdir(), "fuwari-cfg-")),
		"overrides.json",
	);
	await initTestDb();
	const token = await createSession("admin");
	cookie = `fuwari_session=${token}`;
});

const h = () => ({ cookie, "Content-Type": "application/json" });

describe("admins routes", () => {
	it("requires auth", async () => {
		expect((await apiApp.request("/api/admin/admins")).status).toBe(401);
	});

	it("lists default admin", async () => {
		const res = await apiApp.request("/api/admin/admins", { headers: { cookie } });
		expect(res.status).toBe(200);
		const data = (await res.json()).data;
		expect(data).toHaveLength(1);
		expect(data[0].username).toBe("admin");
	});

	it("creates admin; duplicate 409; weak password 400", async () => {
		const create = await apiApp.request("/api/admin/admins", {
			method: "POST", headers: h(),
			body: JSON.stringify({ username: "u1", password: "password12345" }),
		});
		expect(create.status).toBe(201);
		const dup = await apiApp.request("/api/admin/admins", {
			method: "POST", headers: h(),
			body: JSON.stringify({ username: "u1", password: "password12345" }),
		});
		expect(dup.status).toBe(409);
		const weak = await apiApp.request("/api/admin/admins", {
			method: "POST", headers: h(),
			body: JSON.stringify({ username: "u2", password: "short" }),
		});
		expect(weak.status).toBe(400);
	});

	it("PUT change password requires target's current password", async () => {
		await apiApp.request("/api/admin/admins", {
			method: "POST", headers: h(),
			body: JSON.stringify({ username: "u1", password: "password12345" }),
		});
		const wrong = await apiApp.request("/api/admin/admins/u1", {
			method: "PUT", headers: h(),
			body: JSON.stringify({ currentPassword: "badbadbadbad", newPassword: "newpassword123" }),
		});
		expect(wrong.status).toBe(403);
		const right = await apiApp.request("/api/admin/admins/u1", {
			method: "PUT", headers: h(),
			body: JSON.stringify({ currentPassword: "password12345", newPassword: "newpassword123" }),
		});
		expect(right.status).toBe(200);
	});

	it("DELETE requires operator password; last-admin guard", async () => {
		await apiApp.request("/api/admin/admins", {
			method: "POST", headers: h(),
			body: JSON.stringify({ username: "u1", password: "password12345" }),
		});
		const noPw = await apiApp.request("/api/admin/admins/u1", {
			method: "DELETE", headers: h(), body: JSON.stringify({}),
		});
		expect(noPw.status).toBe(400);
		const badPw = await apiApp.request("/api/admin/admins/u1", {
			method: "DELETE", headers: h(),
			body: JSON.stringify({ confirmPassword: "wrongwrongwro" }),
		});
		expect(badPw.status).toBe(403);
		const okDel = await apiApp.request("/api/admin/admins/u1", {
			method: "DELETE", headers: h(),
			body: JSON.stringify({ confirmPassword: "admin12345678" }),
		});
		expect(okDel.status).toBe(200);

		const last = await apiApp.request("/api/admin/admins/admin", {
			method: "DELETE", headers: h(),
			body: JSON.stringify({ confirmPassword: "admin12345678" }),
		});
		expect(last.status).toBe(400);
	});

	it("update-email sets operator email with validation", async () => {
		const bad = await apiApp.request("/api/admin/update-email", {
			method: "POST", headers: h(), body: JSON.stringify({ email: "not-an-email" }),
		});
		expect(bad.status).toBe(400);
		const good = await apiApp.request("/api/admin/update-email", {
			method: "POST", headers: h(), body: JSON.stringify({ email: "a@b.com" }),
		});
		expect(good.status).toBe(200);
		const list = (await (await apiApp.request("/api/admin/admins", { headers: { cookie } })).json()).data;
		expect(list.find((a: { username: string }) => a.username === "admin").email).toBe("a@b.com");
	});
});
```

`src/server/routes/config.test.ts`:

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { apiApp } from "../app";
import { initTestDb } from "../db/testing";
import { createSession } from "../services/session";

let cookie = "";
let overridesPath = "";

beforeEach(async () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fuwari-cfg-"));
	overridesPath = path.join(dir, "overrides.json");
	process.env.CONFIG_OVERRIDES_PATH = overridesPath;
	await initTestDb();
	cookie = `fuwari_session=${await createSession("admin")}`;
});

describe("config routes", () => {
	it("requires auth", async () => {
		expect((await apiApp.request("/api/admin/config")).status).toBe(401);
	});

	it("GET returns merged config object", async () => {
		const res = await apiApp.request("/api/admin/config", { headers: { cookie } });
		expect(res.status).toBe(200);
		const data = (await res.json()).data;
		expect(typeof data).toBe("object");
	});

	it("PUT accepts whitelisted keys and persists overrides", async () => {
		const res = await apiApp.request("/api/admin/config", {
			method: "PUT",
			headers: { cookie, "Content-Type": "application/json" },
			body: JSON.stringify({ site: { title: "测试站" }, captcha: { provider: "none" } }),
		});
		expect(res.status).toBe(200);
		const saved = JSON.parse(fs.readFileSync(overridesPath, "utf-8"));
		expect(saved.site.title).toBe("测试站");
	});

	it("PUT rejects unknown keys", async () => {
		const res = await apiApp.request("/api/admin/config", {
			method: "PUT",
			headers: { cookie, "Content-Type": "application/json" },
			body: JSON.stringify({ evil: {} }),
		});
		expect(res.status).toBe(400);
	});
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test -- src/server/routes/admins.test.ts src/server/routes/config.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

`src/server/routes/admins.ts`(行为对齐旧端点:PUT 校验目标账号当前密码;DELETE 校验操作者密码):

```ts
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../http";
import { fail, ok } from "../http";
import { requireAuth } from "../middleware/auth";
import {
	changePassword,
	createAdmin,
	deleteAdmin,
	listAdmins,
	setAdminEmail,
	verifyAdmin,
} from "../services/admins-repo";
import { validatePasswordStrength } from "../services/security";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const CreateAdminSchema = z.object({
	username: z.string().min(1),
	password: z.string().min(1),
});

const ChangePasswordSchema = z.object({
	currentPassword: z.string().min(1),
	newPassword: z.string().min(1),
});

const DeleteAdminSchema = z.object({ confirmPassword: z.string().min(1) });
const UpdateEmailSchema = z.object({ email: z.string().min(1) });

export const adminsRoutes = new Hono<AppEnv>();

adminsRoutes.get("/admin/admins", requireAuth, async (c) => ok(c, await listAdmins()));

adminsRoutes.post("/admin/admins", requireAuth, async (c) => {
	const parsed = CreateAdminSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) {
		return fail(c, 400, "invalid_request", "Missing required fields: username, password");
	}
	const strength = validatePasswordStrength(parsed.data.password);
	if (!strength.valid) {
		return fail(c, 400, "weak_password", strength.error ?? "密码强度不足");
	}
	const success = await createAdmin(parsed.data.username, parsed.data.password);
	if (!success) {
		return fail(c, 409, "conflict", "Failed to create admin (username may already exist)");
	}
	return c.json({ ok: true, data: { username: parsed.data.username } }, 201);
});

adminsRoutes.put("/admin/admins/:username", requireAuth, async (c) => {
	const username = c.req.param("username");
	const parsed = ChangePasswordSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) {
		return fail(c, 400, "invalid_request", "Current password is required");
	}
	const verified = await verifyAdmin(username, parsed.data.currentPassword);
	if (!verified) {
		return fail(c, 403, "forbidden", "Current password is incorrect");
	}
	const success = await changePassword(username, parsed.data.newPassword);
	if (!success) {
		return fail(c, 404, "not_found", "Admin not found");
	}
	return ok(c, { username });
});

adminsRoutes.delete("/admin/admins/:username", requireAuth, async (c) => {
	const username = c.req.param("username");
	const parsed = DeleteAdminSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) {
		return fail(c, 400, "invalid_request", "Password confirmation is required");
	}
	const operator = c.get("username");
	const verified = await verifyAdmin(operator, parsed.data.confirmPassword);
	if (!verified) {
		return fail(c, 403, "forbidden", "Password confirmation failed");
	}
	const success = await deleteAdmin(username);
	if (!success) {
		return fail(c, 400, "bad_request", "Cannot delete admin (not found or is the last admin)");
	}
	return ok(c, { username });
});

adminsRoutes.post("/admin/update-email", requireAuth, async (c) => {
	const parsed = UpdateEmailSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) {
		return fail(c, 400, "invalid_request", "Email is required");
	}
	const email = parsed.data.email.trim();
	if (!EMAIL_REGEX.test(email)) {
		return fail(c, 400, "invalid_email", "Invalid email format");
	}
	const success = await setAdminEmail(c.get("username"), email);
	if (!success) {
		return fail(c, 404, "not_found", "Admin not found");
	}
	return ok(c, { email });
});
```

`src/server/routes/config.ts`:

```ts
import { Hono } from "hono";
import type { AppEnv } from "../http";
import { fail, ok } from "../http";
import { requireAuth } from "../middleware/auth";
import { getMergedConfig, writeOverrides } from "../services/config-store";

const ALLOWED_CONFIG_KEYS = new Set([
	"site",
	"navBar",
	"profile",
	"license",
	"expressiveCode",
	"aiSummary",
	"captcha",
]);

export const configRoutes = new Hono<AppEnv>();

configRoutes.get("/admin/config", requireAuth, async (c) => ok(c, await getMergedConfig()));

configRoutes.put("/admin/config", requireAuth, async (c) => {
	const body: unknown = await c.req.json().catch(() => null);
	if (!body || typeof body !== "object" || Array.isArray(body)) {
		return fail(c, 400, "invalid_request", "Invalid config body");
	}
	const unknownKeys = Object.keys(body).filter((key) => !ALLOWED_CONFIG_KEYS.has(key));
	if (unknownKeys.length > 0) {
		return fail(c, 400, "invalid_request", `Unknown config keys: ${unknownKeys.join(", ")}`);
	}
	writeOverrides(body as Record<string, unknown>);
	return ok(c, { success: true });
});
```

`app.ts` 挂载:`app.route("/", adminsRoutes); app.route("/", configRoutes);`

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm test -- src/server/routes/admins.test.ts src/server/routes/config.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/server/routes/admins.ts src/server/routes/admins.test.ts src/server/routes/config.ts src/server/routes/config.test.ts src/server/app.ts
git commit -m "feat: 管理员/邮箱/站点配置路由"
```

---

### Task 14: stats 路由(含公开埋点限速)

**Files:**
- Create: `src/server/routes/stats.ts`
- Modify: `src/server/app.ts`
- Test: `src/server/routes/stats.test.ts`

**Interfaces:**
- Produces: `GET /api/admin/stats?range=`(requireAuth)、`POST /api/stats/record`(公开,限速 60 次/15min/IP,响应保持 `{success:true}` 旧格式)

- [ ] **Step 1: 写失败测试**

`src/server/routes/stats.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { apiApp } from "../app";
import { initTestDb } from "../db/testing";
import { createSession } from "../services/session";

let cookie = "";

beforeEach(async () => {
	await initTestDb();
	cookie = `fuwari_session=${await createSession("admin")}`;
});

const IP = { "x-forwarded-for": "7.7.7.7", "Content-Type": "application/json" };

describe("admin stats", () => {
	it("requires auth", async () => {
		expect((await apiApp.request("/api/admin/stats")).status).toBe(401);
	});

	it("returns stats with default/valid/invalid range", async () => {
		for (const range of ["", "?range=7d", "?range=30d", "?range=all", "?range=bogus"]) {
			const res = await apiApp.request(`/api/admin/stats${range}`, { headers: { cookie } });
			expect(res.status).toBe(200);
			const data = (await res.json()).data;
			expect(data).toHaveProperty("totalPageViews");
			expect(data).toHaveProperty("dailyViews");
			expect(data).toHaveProperty("topArticles");
		}
	});
});

describe("public stats record", () => {
	it("records article views (two rows) and page views", async () => {
		const res = await apiApp.request("/api/stats/record", {
			method: "POST", headers: IP,
			body: JSON.stringify({ type: "article", slug: "hello-world" }),
		});
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ success: true });

		await apiApp.request("/api/stats/record", {
			method: "POST", headers: { ...IP, "x-forwarded-for": "6.6.6.6" },
			body: JSON.stringify({ type: "page", path: "/about" }),
		});

		const stats = (await (await apiApp.request("/api/admin/stats?range=all", { headers: { cookie } })).json()).data;
		expect(stats.totalPageViews).toBe(2); // /posts/hello-world + /about
		expect(stats.totalArticleViews).toBe(1);
	});

	it("tolerates trailing slash (blog frontend calls /api/stats/record/)", async () => {
		const res = await apiApp.request("/api/stats/record/", {
			method: "POST", headers: { ...IP, "x-forwarded-for": "5.5.5.5" },
			body: JSON.stringify({ type: "page", path: "/" }),
		});
		expect(res.status).toBe(200);
	});

	it("rate limits after 60 requests per IP", async () => {
		for (let i = 0; i < 60; i++) {
			const res = await apiApp.request("/api/stats/record", {
				method: "POST", headers: IP,
				body: JSON.stringify({ type: "page", path: "/" }),
			});
			expect(res.status).toBe(200);
		}
		const blocked = await apiApp.request("/api/stats/record", {
			method: "POST", headers: IP,
			body: JSON.stringify({ type: "page", path: "/" }),
		});
		expect(blocked.status).toBe(429);
	});
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test -- src/server/routes/stats.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

`src/server/routes/stats.ts`:

```ts
import { Hono } from "hono";
import type { AppEnv } from "../http";
import { ok } from "../http";
import { requireAuth } from "../middleware/auth";
import { checkRateLimit } from "../services/rate-limit";
import { getStats, recordArticleView, recordVisit, type StatsRange } from "../services/stats-repo";
import { RATE_LIMIT_WINDOW_MS } from "../services/security";
import { getClientIp } from "../services/session";

const STATS_RECORD_MAX = 60;

export const statsRoutes = new Hono<AppEnv>();

statsRoutes.get("/admin/stats", requireAuth, async (c) => {
	const raw = c.req.query("range") ?? "7d";
	const range = (["7d", "30d", "all"].includes(raw) ? raw : "7d") as StatsRange;
	return ok(c, await getStats(range));
});

statsRoutes.post("/stats/record", async (c) => {
	const ip = getClientIp(c.req.raw);
	const rl = await checkRateLimit(`stats-record:${ip}`, STATS_RECORD_MAX, RATE_LIMIT_WINDOW_MS);
	if (!rl.allowed) {
		return c.json({ error: "Too many requests" }, 429);
	}
	const body = (await c.req.json().catch(() => null)) as
		| { type?: string; slug?: unknown; path?: unknown }
		| null;
	const slug = typeof body?.slug === "string" ? body.slug : "";
	const pagePath = typeof body?.path === "string" ? body.path : "/";
	if (body?.type === "article" && slug) {
		await recordArticleView(slug);
		await recordVisit(`/posts/${slug}`);
	} else {
		await recordVisit(pagePath || "/");
	}
	// 兼容博客前端的旧响应格式
	return c.json({ success: true });
});
```

`app.ts` 挂载:`app.route("/", statsRoutes);`

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm test -- src/server/routes/stats.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/server/routes/stats.ts src/server/routes/stats.test.ts src/server/app.ts
git commit -m "feat: 统计路由与公开埋点限速"
```

---

### Task 15: ai-summary 路由

**Files:**
- Create: `src/server/routes/ai-summary.ts`
- Modify: `src/server/app.ts`
- Test: `src/server/routes/ai-summary.test.ts`

**Interfaces:**
- Produces: `GET /api/admin/ai-summary`(列表元信息)、`DELETE /api/admin/ai-summary/:slug`、`POST /api/admin/ai-summary/:slug`(恒 501)。缓存目录 `getSummariesDir(): string`(`process.env.AI_SUMMARIES_DIR || cwd/public/ai-summaries`,每次调用读取)

- [ ] **Step 1: 写失败测试**

`src/server/routes/ai-summary.test.ts`:

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { apiApp } from "../app";
import { initTestDb } from "../db/testing";
import { createSession } from "../services/session";

let cookie = "";
let dir = "";

beforeEach(async () => {
	dir = fs.mkdtempSync(path.join(os.tmpdir(), "fuwari-ai-"));
	process.env.AI_SUMMARIES_DIR = dir;
	await initTestDb();
	cookie = `fuwari_session=${await createSession("admin")}`;
});

describe("ai-summary routes", () => {
	it("requires auth", async () => {
		expect((await apiApp.request("/api/admin/ai-summary")).status).toBe(401);
	});

	it("returns empty list when dir missing", async () => {
		fs.rmSync(dir, { recursive: true });
		const res = await apiApp.request("/api/admin/ai-summary", { headers: { cookie } });
		expect(res.status).toBe(200);
		expect((await res.json()).data).toEqual([]);
	});

	it("lists, deletes cache files", async () => {
		fs.writeFileSync(path.join(dir, "hello.json"), "{}");
		fs.writeFileSync(path.join(dir, "notes.txt"), "ignored");
		const list = (await (await apiApp.request("/api/admin/ai-summary", { headers: { cookie } })).json()).data;
		expect(list).toHaveLength(1);
		expect(list[0].slug).toBe("hello");
		expect(list[0].size).toBeGreaterThan(0);
		expect(typeof list[0].modifiedAt).toBe("string");

		const del = await apiApp.request("/api/admin/ai-summary/hello", { method: "DELETE", headers: { cookie } });
		expect(del.status).toBe(200);
		const missing = await apiApp.request("/api/admin/ai-summary/hello", { method: "DELETE", headers: { cookie } });
		expect(missing.status).toBe(404);
	});

	it("POST is 501 not implemented", async () => {
		const res = await apiApp.request("/api/admin/ai-summary/hello", {
			method: "POST", headers: { cookie },
		});
		expect(res.status).toBe(501);
	});

	it("rejects invalid slug", async () => {
		const res = await apiApp.request("/api/admin/ai-summary/Bad_Slug", {
			method: "DELETE", headers: { cookie },
		});
		expect(res.status).toBe(400);
	});
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test -- src/server/routes/ai-summary.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

`src/server/routes/ai-summary.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import type { AppEnv } from "../http";
import { fail, ok } from "../http";
import { requireAuth } from "../middleware/auth";
import { validateSlug } from "../services/security";

function getSummariesDir(): string {
	return process.env.AI_SUMMARIES_DIR || path.join(process.cwd(), "public", "ai-summaries");
}

export const aiSummaryRoutes = new Hono<AppEnv>();

aiSummaryRoutes.get("/admin/ai-summary", requireAuth, (c) => {
	const dir = getSummariesDir();
	if (!fs.existsSync(dir)) return ok(c, []);
	const summaries = fs
		.readdirSync(dir)
		.filter((f) => f.endsWith(".json"))
		.map((file) => {
			const stat = fs.statSync(path.join(dir, file));
			return {
				slug: file.replace(/\.json$/, ""),
				size: stat.size,
				modifiedAt: stat.mtime.toISOString(),
			};
		});
	return ok(c, summaries);
});

aiSummaryRoutes.delete("/admin/ai-summary/:slug", requireAuth, (c) => {
	const slug = c.req.param("slug");
	if (!validateSlug(slug)) return fail(c, 400, "invalid_slug", "Invalid slug format");
	const filePath = path.join(getSummariesDir(), `${slug}.json`);
	if (!fs.existsSync(filePath)) return fail(c, 404, "not_found", "AI summary not found");
	fs.unlinkSync(filePath);
	return ok(c, { slug });
});

aiSummaryRoutes.post("/admin/ai-summary/:slug", requireAuth, (c) => {
	return c.json(
		{ ok: false, error: { code: "not_implemented", message: "not implemented" } },
		501,
	);
});
```

`app.ts` 挂载:`app.route("/", aiSummaryRoutes);` 并在 `createServerApp` 内补上统一错误处理(放在 notFound 之前):

```ts
app.onError((err, c) => {
	console.error("[api]", c.req.method, c.req.path, err);
	return c.json(
		{ ok: false, error: { code: "internal", message: "Internal server error" } },
		500,
	);
});
```

- [ ] **Step 4: 跑测试确认通过 + 全量回归**

```bash
pnpm test && pnpm check
```

Expected: 全部 PASS

- [ ] **Step 5: 提交**

```bash
git add src/server/routes/ai-summary.ts src/server/routes/ai-summary.test.ts src/server/app.ts
git commit -m "feat: AI 总结缓存路由"
```

---

### Task 16: 切换全量 /api 委托,删除旧后端代码

**Files:**
- Modify: `src/middleware.ts`
- Delete: `src/pages/api/`(整个目录)、`src/utils/admin/`(整个目录)、`src/utils/__tests__/admin-db.test.ts`
- Modify: `src/env.d.ts` 若声明了 `locals.username`

**Interfaces:**
- Consumes: Task 1-15 全部
- Produces: 生产形态——所有 `/api/*` 由 Hono 处理;旧 Astro API 路由与旧 utils 全部移除

- [ ] **Step 1: 全量委托**

`src/middleware.ts` 中把 spike 分支改为:

```ts
if (url.pathname.startsWith("/api/")) {
	return apiApp.fetch(context.request);
}
```

删除 `normalizePath` 与 `/api/__health` 特判(保留 hue 注入与安全头逻辑)。

- [ ] **Step 2: 删除旧代码**

```bash
git rm -r src/pages/api src/utils/admin
git rm src/utils/__tests__/admin-db.test.ts
```

删除前先全局搜索确认没有残余引用:

```bash
grep -rn "utils/admin" src/ --include="*.ts" --include="*.astro"
```

期望:只剩 `src/middleware.ts`(已无引用)与被删文件本身。若 `src/env.d.ts` 有 `App.Locals.username` 声明,一并移除。注意:**删除目录需先向用户确认**(用户偏好)。

- [ ] **Step 3: 全量验证**

```bash
pnpm check && pnpm test && pnpm lint
```

启动 dev server 手动验证(browser-use + 本地 Chrome):

1. `http://127.0.0.1:4321/` 博客首页正常(样式/`--hue`)
2. `http://127.0.0.1:4321/api/admin/me` 返回 401 封装 `{"ok":false,...}`
3. `http://127.0.0.1:4321/api/__health` 200
4. `POST /api/stats/record` 经博客前台访问文章页后 `GET /api/admin/stats` 有数据(可延后到 Task 19 一并验证)
5. 旧管理面板(`/admin/`)此刻暂不可用(Task 17-19 重建)——预期状态

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "refactor: 切换全量 /api 委托至 Hono,移除旧 Astro API 与 utils/admin"
```

---

### Task 17: SPA 脚手架 + 登录/重置密码页

**Files:**
- Create: `src/admin-spa/vite.config.ts`、`src/admin-spa/index.html`、`src/admin-spa/src/main.ts`、`src/admin-spa/src/app.css`、`src/admin-spa/src/api.ts`、`src/admin-spa/src/router.ts`、`src/admin-spa/src/App.svelte`、`src/admin-spa/src/components/Captcha.svelte`、`src/admin-spa/src/pages/Login.svelte`、`src/admin-spa/src/pages/ResetPassword.svelte`
- Modify: `package.json`(scripts)、`.gitignore`

**Interfaces:**
- Consumes: 新 API(Task 11-15)
- Produces:
  - `api<T>(path: string, opts?: RequestInit): Promise<T>`(解析 `{ok,data}` 封装;401 且非公开页时跳 `#/login`;抛 `ApiError{status, code, message, data}`)
  - `parseHash(hash: string): { name: string; params: Record<string,string>; query: URLSearchParams }`、`navigate(to: string): void`
  - 路由表:`#/login`、`#/reset-password?token=`、`#/posts`、`#/posts/new`、`#/posts/:slug`、`#/admins`、`#/config`、`#/stats`、`#/ai-summary`
  - scripts:`pnpm dev:admin`(5175 端口,`/api` 代理到 4321)、`pnpm build:admin`(输出 `public/admin/`)

- [ ] **Step 1: 安装 SPA 构建依赖**

```bash
pnpm add -D @sveltejs/vite-plugin-svelte
```

- [ ] **Step 2: 脚手架文件**

`src/admin-spa/vite.config.ts`:

```ts
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	root,
	plugins: [svelte(), tailwindcss()],
	build: {
		outDir: path.resolve(root, "../../public/admin"),
		emptyOutDir: true,
	},
	server: {
		port: 5175,
		proxy: { "/api": "http://127.0.0.1:4321" },
	},
});
```

`src/admin-spa/index.html`:

```html
<!doctype html>
<html lang="zh-CN">
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<title>管理面板</title>
	</head>
	<body>
		<div id="app"></div>
		<script type="module" src="/src/main.ts"></script>
	</body>
</html>
```

`src/admin-spa/src/main.ts`:

```ts
import { mount } from "svelte";
import "./app.css";
import App from "./App.svelte";

mount(App, { target: document.getElementById("app")! });
```

`src/admin-spa/src/app.css`(dark 变体沿用博客的 class 策略):

```css
@import "tailwindcss";

@custom-variant dark (&:where(.dark, .dark *));
```

`src/admin-spa/src/api.ts`:

```ts
export class ApiError extends Error {
	constructor(
		public status: number,
		public code: string,
		message: string,
		public data?: Record<string, unknown>,
	) {
		super(message);
	}
}

function isPublicRoute(): boolean {
	return (
		location.hash.startsWith("#/login") || location.hash.startsWith("#/reset-password")
	);
}

export async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
	const res = await fetch(path, {
		headers: { "Content-Type": "application/json", ...(opts.headers ?? {}) },
		...opts,
	});
	const body = (await res.json().catch(() => null)) as
		| { ok: boolean; data?: T; error?: { code: string; message: string } & Record<string, unknown> }
		| null;

	if (!res.ok || !body?.ok) {
		if (res.status === 401 && !isPublicRoute()) {
			location.hash = "#/login";
		}
		throw new ApiError(
			res.status,
			body?.error?.code ?? "unknown",
			body?.error?.message ?? `HTTP ${res.status}`,
			body?.error,
		);
	}
	return body.data as T;
}
```

`src/admin-spa/src/router.ts`:

```ts
export type Route = {
	name: string;
	params: Record<string, string>;
	query: URLSearchParams;
};

export function parseHash(hash: string): Route {
	const clean = hash.replace(/^#\/?/, "");
	const [pathPart, queryPart] = clean.split("?");
	const segs = pathPart.split("/").filter(Boolean);
	const name = segs[0] || "login";
	const params: Record<string, string> = {};
	if (name === "posts" && segs[1]) params.slug = segs[1];
	return { name, params, query: new URLSearchParams(queryPart ?? "") };
}

export function navigate(to: string): void {
	location.hash = to;
}
```

- [ ] **Step 3: Captcha 组件**

`src/admin-spa/src/components/Captcha.svelte`:

```svelte
<script lang="ts">
	import { onMount } from "svelte";
	import { api } from "../api";

	type CaptchaInfo = { enabled: boolean; provider: "turnstile" | "hcaptcha" | "none"; siteKey: string };

	let { onToken }: { onToken: (token: string) => void } = $props();
	let container: HTMLDivElement | undefined = $state();
	let info: CaptchaInfo | null = $state(null);

	const loadedScripts = new Set<string>();
	function loadScript(src: string): Promise<void> {
		if (loadedScripts.has(src)) return Promise.resolve();
		return new Promise((resolve, reject) => {
			const el = document.createElement("script");
			el.src = src;
			el.async = true;
			el.onload = () => {
				loadedScripts.add(src);
				resolve();
			};
			el.onerror = () => reject(new Error(`Failed to load ${src}`));
			document.head.appendChild(el);
		});
	}

	onMount(async () => {
		try {
			info = await api<CaptchaInfo>("/api/admin/captcha-config");
		} catch {
			info = null;
			return;
		}
		if (!info.enabled || info.provider === "none" || !container) return;
		const src =
			info.provider === "turnstile"
				? "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
				: "https://js.hcaptcha.com/1/api.js?render=explicit";
		await loadScript(src);
		const w = (window as unknown as Record<string, any>)[info.provider];
		w?.render?.(container, {
			sitekey: info.siteKey,
			callback: (token: string) => onToken(token),
			"expired-callback": () => onToken(""),
		});
	});
</script>

{#if info?.enabled}
	<div bind:this={container}></div>
{/if}
```

- [ ] **Step 4: Login 与 ResetPassword 页面**

`src/admin-spa/src/pages/Login.svelte`(验证码失败时通过 `{#key}` 重挂 Captcha 拿新 token):

```svelte
<script lang="ts">
	import Captcha from "../components/Captcha.svelte";
	import { api, ApiError } from "../api";
	import { navigate } from "../router";

	let username = $state("");
	let password = $state("");
	let token = $state("");
	let error = $state("");
	let busy = $state(false);
	let captchaKey = $state(0);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		error = "";
		busy = true;
		try {
			await api("/api/admin/auth", {
				method: "POST",
				body: JSON.stringify({ username, password, captchaToken: token || undefined }),
			});
			navigate("#/posts");
		} catch (err) {
			if (err instanceof ApiError) {
				error = err.message;
				if (err.code === "captcha_failed") {
					token = "";
					captchaKey++;
				}
			} else {
				error = "网络错误";
			}
		} finally {
			busy = false;
		}
	}
</script>

<div class="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 px-4">
	<form
		onsubmit={submit}
		class="w-full max-w-sm bg-white dark:bg-gray-800 rounded-lg shadow p-8 space-y-4"
	>
		<h1 class="text-2xl font-bold text-gray-900 dark:text-white text-center">管理登录</h1>

		{#if error}
			<div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
				<p class="text-red-600 dark:text-red-400 text-sm">{error}</p>
			</div>
		{/if}

		<input
			type="text"
			bind:value={username}
			placeholder="用户名"
			autocomplete="username"
			class="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
		/>
		<input
			type="password"
			bind:value={password}
			placeholder="密码"
			autocomplete="current-password"
			class="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
		/>

		{#key captchaKey}
			<Captcha onToken={(t) => (token = t)} />
		{/key}

		<button
			type="submit"
			disabled={busy}
			class="w-full px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition font-medium disabled:opacity-50"
		>
			{busy ? "登录中..." : "登录"}
		</button>

		<p class="text-center">
			<a
				href="#/reset-password"
				class="text-sm text-blue-600 dark:text-blue-400 hover:underline"
			>忘记密码?</a
			>
		</p>
	</form>
</div>
```

`src/admin-spa/src/pages/ResetPassword.svelte`:

```svelte
<script lang="ts">
	import Captcha from "../components/Captcha.svelte";
	import { api, ApiError } from "../api";
	import { navigate } from "../router";

	let { query }: { query: URLSearchParams } = $props();
	const token = query.get("token") ?? "";

	let newPassword = $state("");
	let username = $state("");
	let captchaToken = $state("");
	let error = $state("");
	let success = $state("");
	let busy = $state(false);
	let captchaKey = $state(0);

	async function reset(e: SubmitEvent) {
		e.preventDefault();
		error = "";
		success = "";
		busy = true;
		try {
			const res = await api<{ message: string }>("/api/admin/auth/reset-password", {
				method: "POST",
				body: JSON.stringify({ token, newPassword }),
			});
			success = res.message;
			setTimeout(() => navigate("#/login"), 1500);
		} catch (err) {
			error = err instanceof ApiError ? err.message : "网络错误";
		} finally {
			busy = false;
		}
	}

	async function request(e: SubmitEvent) {
		e.preventDefault();
		error = "";
		success = "";
		busy = true;
		try {
			const res = await api<{ message: string }>("/api/admin/auth/forgot-password", {
				method: "POST",
				body: JSON.stringify({ username, captchaToken: captchaToken || undefined }),
			});
			success = res.message;
		} catch (err) {
			if (err instanceof ApiError) {
				error = err.message;
				if (err.code === "captcha_failed") {
					captchaToken = "";
					captchaKey++;
				}
			} else {
				error = "网络错误";
			}
		} finally {
			busy = false;
		}
	}
</script>

<div class="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 px-4">
	<form
		onsubmit={token ? reset : request}
		class="w-full max-w-sm bg-white dark:bg-gray-800 rounded-lg shadow p-8 space-y-4"
	>
		<h1 class="text-2xl font-bold text-gray-900 dark:text-white text-center">
			{token ? "重置密码" : "找回密码"}
		</h1>

		{#if error}
			<div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
				<p class="text-red-600 dark:text-red-400 text-sm">{error}</p>
			</div>
		{/if}
		{#if success}
			<div
				class="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3"
			>
				<p class="text-green-600 dark:text-green-400 text-sm">{success}</p>
			</div>
		{/if}

		{#if token}
			<input
				type="password"
				bind:value={newPassword}
				placeholder="新密码（至少 12 个字符）"
				autocomplete="new-password"
				class="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
			/>
		{:else}
			<input
				type="text"
				bind:value={username}
				placeholder="用户名"
				class="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
			/>
			{#key captchaKey}
				<Captcha onToken={(t) => (captchaToken = t)} />
			{/key}
		{/if}

		<button
			type="submit"
			disabled={busy}
			class="w-full px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition font-medium disabled:opacity-50"
		>
			{busy ? "提交中..." : token ? "重置密码" : "发送重置邮件"}
		</button>

		<p class="text-center">
			<a href="#/login" class="text-sm text-blue-600 dark:text-blue-400 hover:underline"
				>返回登录</a
			>
		</p>
	</form>
</div>
```

- [ ] **Step 5: App 根组件(占位 Dashboard 入口)**

`src/admin-spa/src/App.svelte`(Dashboard 页面在 Task 18 实现,此处先内置最小占位):

```svelte
<script lang="ts">
	import { onMount } from "svelte";
	import { api } from "./api";
	import { parseHash, navigate } from "./router";
	import Login from "./pages/Login.svelte";
	import ResetPassword from "./pages/ResetPassword.svelte";

	let hash = $state(location.hash || "#/login");
	let authed = $state<boolean | null>(null);

	onMount(() => {
		const onChange = () => (hash = location.hash || "#/login");
		window.addEventListener("hashchange", onChange);
		return () => window.removeEventListener("hashchange", onChange);
	});

	onMount(async () => {
		try {
			await api("/api/admin/me");
			authed = true;
		} catch {
			authed = false;
		}
	});

	const route = $derived(parseHash(hash));
	const isPublic = $derived(route.name === "login" || route.name === "reset-password");

	$effect(() => {
		if (authed === false && !isPublic) navigate("#/login");
		if (authed === true && route.name === "login") navigate("#/posts");
	});
</script>

{#if route.name === "reset-password"}
	<ResetPassword query={route.query} />
{:else if route.name === "login"}
	<Login />
{:else if authed}
	<p class="p-12 text-center text-gray-500">管理面板加载中（Dashboard 于下一步实现）…</p>
{:else}
	<p class="p-12 text-center text-gray-500">加载中...</p>
{/if}
```

- [ ] **Step 6: scripts 与 gitignore**

`package.json` scripts 增改:

```json
"dev:admin": "vite --config src/admin-spa/vite.config.ts",
"build:admin": "vite build --config src/admin-spa/vite.config.ts",
"build": "pnpm build:admin && astro build && pagefind --site dist",
```

`.gitignore` 追加:

```
public/admin/
```

- [ ] **Step 7: 手动验证**

```bash
pnpm dev --host 127.0.0.1   # 终端 1(astro)
pnpm dev:admin              # 终端 2(SPA,5175)
```

browser-use + 本地 Chrome 访问 `http://127.0.0.1:5175/`:

1. 未登录自动到 `#/login`,输入 admin/admin12345678(dev 默认管理员)登录成功跳 `#/posts`
2. 错误密码显示「用户名或密码错误」
3. `#/reset-password` 无 token 显示找回密码表单,提交返回统一提示
4. 若配置了 Turnstile(生产),验证码组件渲染并可刷新——本地 provider=none 时不渲染

- [ ] **Step 8: 提交**

```bash
git add src/admin-spa package.json .gitignore pnpm-lock.yaml
git commit -m "feat: 管理面板 SPA 脚手架与登录/重置密码页"
```

---

### Task 18: SPA Dashboard 与五个功能页

**Files:**
- Create: `src/admin-spa/src/pages/Dashboard.svelte`、`Posts.svelte`、`PostEditor.svelte`、`Admins.svelte`、`Config.svelte`、`Stats.svelte`、`AiSummary.svelte`
- Modify: `src/admin-spa/src/App.svelte`

**Interfaces:**
- Consumes: `api`/`ApiError`(Task 17)、全部管理 API
- Produces: 功能与旧 7 个组件一一对应的完整面板

**移植规则(对从旧组件移植的页面统一适用):**

1. 旧 fetch 模式 `const res = await fetch(X, opts); if (!res.ok) ...; const data = await res.json()` → `const data = await api(X, opts)`;错误经 `catch (e) { error = e instanceof ApiError ? e.message : "网络错误" }`
2. 旧导航 `window.dispatchEvent(new CustomEvent("admin-navigate", ...))` → `navigate("#/posts")` 等 hash 路由
3. 路径去掉尾斜杠(`/api/admin/posts/` → `/api/admin/posts`)
4. 请求体不变;POST 创建文章成功返回 201 的 `{ ok, data }` 由 `api()` 正常解析
5. 标记语言保持 Svelte 经典语法(`let`/`bind:`/`on:click`,Svelte 5 兼容),markup 原样保留
6. 暗色模式:Dashboard 初始化时读取 `localStorage.getItem('theme') === 'dark'` 给 `<html>` 加 `dark` class,并提供切换按钮(与博客行为一致)

- [ ] **Step 1: Dashboard 布局壳(替代旧 AdminApp.svelte 的 tab 部分)**

`src/admin-spa/src/pages/Dashboard.svelte`:

```svelte
<script lang="ts">
	import { onMount } from "svelte";
	import type { Route } from "../router";
	import { navigate } from "../router";
	import { api } from "../api";
	import Posts from "./Posts.svelte";
	import PostEditor from "./PostEditor.svelte";
	import Admins from "./Admins.svelte";
	import Config from "./Config.svelte";
	import Stats from "./Stats.svelte";
	import AiSummary from "./AiSummary.svelte";

	let { route }: { route: Route } = $props();
	let username = $state("");

	const tabs = [
		{ name: "posts", label: "文章" },
		{ name: "admins", label: "管理员" },
		{ name: "config", label: "配置" },
		{ name: "stats", label: "统计" },
		{ name: "ai-summary", label: "AI 总结" },
	];

	onMount(async () => {
		try {
			const me = await api<{ username: string }>("/api/admin/me");
			username = me.username;
		} catch {
			/* 401 已由 api() 跳转登录 */
		}
		if (localStorage.getItem("theme") === "dark") {
			document.documentElement.classList.add("dark");
		}
	});

	function toggleTheme() {
		const el = document.documentElement;
		el.classList.toggle("dark");
		localStorage.setItem("theme", el.classList.contains("dark") ? "dark" : "light");
	}

	async function logout() {
		await api("/api/admin/logout", { method: "POST" }).catch(() => {});
		navigate("#/login");
		location.reload();
	}
</script>

<div class="min-h-screen bg-gray-100 dark:bg-gray-900">
	<header class="bg-white dark:bg-gray-800 shadow">
		<div class="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
			<h1 class="text-lg font-bold text-gray-900 dark:text-white">博客管理面板</h1>
			<div class="flex items-center gap-3">
				<span class="text-sm text-gray-600 dark:text-gray-400">{username}</span>
				<button
					onclick={toggleTheme}
					class="px-3 py-1 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
				>主题</button>
				<button
					onclick={logout}
					class="px-3 py-1 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700"
				>退出</button>
			</div>
		</div>
		<nav class="max-w-7xl mx-auto px-4 flex gap-1">
			{#each tabs as tab (tab.name)}
				<button
					onclick={() => navigate(`#/${tab.name}`)}
					class="px-4 py-2 text-sm rounded-t-lg transition {route.name === tab.name
						? 'bg-gray-100 dark:bg-gray-900 text-blue-600 dark:text-blue-400 font-medium'
						: 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}"
				>{tab.label}</button>
			{/each}
		</nav>
	</header>

	<main class="max-w-7xl mx-auto px-4 py-6">
		{#if route.name === "posts" && route.params.slug}
			<PostEditor slug={route.params.slug === "new" ? null : route.params.slug} />
		{:else if route.name === "posts"}
			<Posts />
		{:else if route.name === "admins"}
			<Admins />
		{:else if route.name === "config"}
			<Config />
		{:else if route.name === "stats"}
			<Stats />
		{:else if route.name === "ai-summary"}
			<AiSummary />
		{/if}
	</main>
</div>
```

- [ ] **Step 2: Posts 列表页(移植 PostList.svelte)**

从 `src/components/admin/PostList.svelte` 拷贝 markup(原样),`<script>` 换为:

```svelte
<script>
	import { onMount } from "svelte";
	import { api, ApiError } from "../api";
	import { navigate } from "../router";

	let posts = [];
	let loading = true;
	let error = "";
	let deleteTarget = null;
	let deleting = false;

	async function loadPosts() {
		loading = true;
		error = "";
		try {
			posts = await api("/api/admin/posts");
		} catch (e) {
			error = `加载文章失败: ${e instanceof ApiError ? e.message : "网络错误"}`;
		} finally {
			loading = false;
		}
	}

	function newPost() {
		navigate("#/posts/new");
	}

	async function doDelete() {
		if (!deleteTarget) return;
		deleting = true;
		try {
			await api(`/api/admin/posts/${deleteTarget.slug}`, { method: "DELETE" });
			posts = posts.filter((p) => p.slug !== deleteTarget.slug);
			deleteTarget = null;
		} catch (e) {
			error = `删除失败: ${e instanceof ApiError ? e.message : "网络错误"}`;
		} finally {
			deleting = false;
		}
	}

	onMount(loadPosts);
</script>
```

markup 中 `editPost(post.slug)` 改为 `navigate(\`#/posts/${post.slug}\`)`;删除确认弹窗的 `cancelDelete` 保留。

- [ ] **Step 3: PostEditor(移植 PostEditor.svelte)**

从旧文件拷贝 markup(原样,含 slug 输入、Markdown textarea、frontmatter 表单),`<script>` 换为:

```svelte
<script>
	import { onMount } from "svelte";
	import { api, ApiError } from "../api";
	import { navigate } from "../router";

	export let slug = null; // null = 新建

	let isNew = !slug;
	let loading = !isNew;
	let saving = false;
	let error = "";
	let success = "";

	let newSlug = "";
	let title = "";
	let content = "";
	let published = "";
	let description = "";
	let tagsStr = "";
	let category = "";
	let draft = false;

	async function loadPost() {
		if (isNew) return;
		loading = true;
		error = "";
		try {
			const data = await api(`/api/admin/posts/${slug}`);
			title = data.title || "";
			content = data.content || "";
			published = data.published || "";
			description = data.description || "";
			tagsStr = (data.tags || []).join(", ");
			category = data.category || "";
			draft = data.draft || false;
		} catch (e) {
			error = `加载文章失败: ${e instanceof ApiError ? e.message : "网络错误"}`;
		} finally {
			loading = false;
		}
	}

	async function savePost() {
		saving = true;
		error = "";
		success = "";

		const tags = tagsStr.split(",").map((t) => t.trim()).filter(Boolean);
		const frontmatter = {
			title,
			published: published || new Date().toISOString().slice(0, 10),
			description,
			tags,
			category,
			draft,
		};

		try {
			if (isNew) {
				if (!newSlug.trim()) {
					error = "请输入文章 slug";
					saving = false;
					return;
				}
				await api("/api/admin/posts", {
					method: "POST",
					body: JSON.stringify({ slug: newSlug.trim(), title, content, frontmatter }),
				});
			} else {
				await api(`/api/admin/posts/${slug}`, {
					method: "PUT",
					body: JSON.stringify({ content, frontmatter }),
				});
			}
			success = "保存成功！";
			setTimeout(() => navigate("#/posts"), 800);
		} catch (e) {
			error = `保存失败: ${e instanceof ApiError ? e.message : "网络错误"}`;
		} finally {
			saving = false;
		}
	}

	function goBack() {
		navigate("#/posts");
	}

	onMount(loadPost);
</script>
```

- [ ] **Step 4: Admins(移植 AdminManagePanel.svelte)**

从旧文件拷贝 markup 原样(创建表单/改密表单/邮箱表单/删除确认弹窗),`<script>` 按移植规则改写——关键差异点(其余 fetch 块同规则机械替换):

```svelte
<script>
	import { onMount } from "svelte";
	import { api, ApiError } from "../api";

	let admins = [];
	let loading = true;
	let error = "";
	let successMsg = "";
	let currentUsername = "";

	let showCreateForm = false;
	let newUsername = "";
	let newPassword = "";
	let createError = "";

	let editingUsername = "";
	let newPasswordInput = "";
	let currentPasswordInput = "";
	let changePwError = "";

	let editingEmailUsername = "";
	let emailInput = "";
	let emailError = "";

	let deleteConfirmUsername = "";
	let deleteConfirmPassword = "";
	let showDeleteConfirm = false;
	let deleting = false;

	onMount(async () => {
		try {
			const me = await api("/api/admin/me");
			currentUsername = me.username;
		} catch { /* ignore */ }
		loadAdmins();
	});

	async function loadAdmins() {
		loading = true;
		error = "";
		try {
			admins = await api("/api/admin/admins");
		} catch (e) {
			error = e instanceof ApiError ? e.message : "加载管理员列表失败";
		} finally {
			loading = false;
		}
	}

	async function handleCreate() {
		createError = "";
		if (!newUsername || !newPassword) { createError = "请填写用户名和密码"; return; }
		if (newPassword.length < 12) { createError = "密码至少 12 个字符"; return; }
		try {
			await api("/api/admin/admins", {
				method: "POST",
				body: JSON.stringify({ username: newUsername, password: newPassword }),
			});
			successMsg = `管理员 "${newUsername}" 创建成功`;
			newUsername = "";
			newPassword = "";
			showCreateForm = false;
			loadAdmins();
			setTimeout(() => (successMsg = ""), 3000);
		} catch (e) {
			createError = e instanceof ApiError ? e.message : "创建失败";
		}
	}

	async function handleChangePassword() {
		changePwError = "";
		if (!currentPasswordInput) { changePwError = "请输入当前密码"; return; }
		if (!newPasswordInput || newPasswordInput.length < 12) { changePwError = "密码至少 12 个字符"; return; }
		try {
			await api(`/api/admin/admins/${editingUsername}`, {
				method: "PUT",
				body: JSON.stringify({ newPassword: newPasswordInput, currentPassword: currentPasswordInput }),
			});
			successMsg = `"${editingUsername}" 密码已修改`;
			editingUsername = "";
			newPasswordInput = "";
			currentPasswordInput = "";
			setTimeout(() => (successMsg = ""), 3000);
		} catch (e) {
			changePwError = e instanceof ApiError ? e.message : "修改失败";
		}
	}

	async function handleUpdateEmail() {
		emailError = "";
		if (!emailInput) { emailError = "请输入邮箱地址"; return; }
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(emailInput.trim())) { emailError = "邮箱格式不正确"; return; }
		try {
			await api("/api/admin/update-email", {
				method: "POST",
				body: JSON.stringify({ email: emailInput.trim() }),
			});
			successMsg = `邮箱已更新为 "${emailInput.trim()}"`;
			editingEmailUsername = "";
			emailInput = "";
			loadAdmins();
			setTimeout(() => (successMsg = ""), 3000);
		} catch (e) {
			emailError = e instanceof ApiError ? e.message : "更新失败";
		}
	}

	function handleDelete(username) {
		if (username === currentUsername) {
			error = "不能删除当前登录的管理员";
			setTimeout(() => (error = ""), 3000);
			return;
		}
		deleteConfirmUsername = username;
		deleteConfirmPassword = "";
		showDeleteConfirm = true;
	}

	async function confirmDelete() {
		if (!deleteConfirmPassword) { error = "请输入密码确认"; return; }
		deleting = true;
		try {
			await api(`/api/admin/admins/${deleteConfirmUsername}`, {
				method: "DELETE",
				body: JSON.stringify({ confirmPassword: deleteConfirmPassword }),
			});
			successMsg = `管理员 "${deleteConfirmUsername}" 已删除`;
			loadAdmins();
			setTimeout(() => (successMsg = ""), 3000);
		} catch (e) {
			error = e instanceof ApiError ? e.message : "删除失败";
			setTimeout(() => (error = ""), 3000);
		} finally {
			deleting = false;
			showDeleteConfirm = false;
		}
	}
</script>
```

- [ ] **Step 5: Config / Stats / AiSummary(移植对应旧组件)**

- `Config.svelte`:拷贝 `src/components/admin/ConfigPanel.svelte` 的 markup 原样(站点/资料/许可证/AI/验证码五段表单);script 改动:`loadConfig` 里 `config = await api("/api/admin/config")` 后 `applyConfig()` 不变;`saveConfig` 改为:

```js
try {
	await api("/api/admin/config", {
		method: "PUT",
		body: JSON.stringify(overrides),
	});
	success = "配置保存成功！";
	setTimeout(() => (success = ""), 3000);
} catch (e) {
	error = `保存失败: ${e instanceof ApiError ? e.message : "网络错误"}`;
} finally {
	saving = false;
}
```

- `Stats.svelte`:拷贝 `src/components/admin/StatsPanel.svelte` 原样;script:`stats = await api(\`/api/admin/stats?range=${range}\`)`,错误处理按移植规则。
- `AiSummary.svelte`:拷贝 `src/components/admin/AiSummaryPanel.svelte` 原样;script:`summaries = await api("/api/admin/ai-summary")`;删除改 `await api(\`/api/admin/ai-summary/${slug}\`, { method: "DELETE" })`;`regenerate` 改为:

```js
async function regenerate(slug) {
	error = "";
	try {
		await api(`/api/admin/ai-summary/${slug}`, { method: "POST" });
		error = "操作失败";
	} catch (e) {
		error = e instanceof ApiError && e.status === 501 ? "重新生成功能暂未实现" : "请求失败";
	}
}
```

- [ ] **Step 6: App.svelte 接入 Dashboard**

`App.svelte` 中占位分支替换为:

```svelte
{:else if authed}
	<Dashboard {route} />
```

并 `import Dashboard from "./pages/Dashboard.svelte";`

- [ ] **Step 7: 手动验证(dev 模式,browser-use + 本地 Chrome)**

`http://127.0.0.1:5175/` 登录后逐页验证:

1. 文章:列表加载、新建(slug 校验/重复 409 提示)、编辑保存、删除确认
2. 管理员:创建、改密(错误当前密码 403)、改邮箱、删除(输密码)
3. 配置:加载当前值、修改标题保存、写盘 `data/config-overrides.json` 验证
4. 统计:三个 range 切换、图表渲染(先访问几个博客页面制造数据)
5. AI 总结:列表(需 `public/ai-summaries/` 有文件,可手工放一个 json)、删除、重新生成提示未实现
6. 退出登录回到登录页;直接访问 `#/config` 未登录被弹回登录

- [ ] **Step 8: 提交**

```bash
git add src/admin-spa
git commit -m "feat: 管理面板 SPA 全部功能页"
```

---

### Task 19: 入口整合、旧管理页面删除、构建与端到端验证

**Files:**
- Create: `src/pages/admin/index.astro`、`src/pages/admin/reset-password.astro`(均为重定向壳)
- Delete: `src/pages/admin/dashboard.astro`、`src/pages/admin/index.astro` 旧实现、`src/pages/admin/reset-password.astro` 旧实现、`src/components/admin/`(整个目录,7 个文件)

**Interfaces:**
- Produces: 最终形态——`/admin` 与 `/admin/reset-password/?token=` 进入 SPA;`pnpm build` 产出含 SPA 的 dist;部署流程(PM2 + OpenResty)零变化

- [ ] **Step 1: 替换 admin 入口页为重定向壳**

删除旧 `src/pages/admin/` 三个页面与 `src/components/admin/` 目录(**删除前向用户确认**)。新建:

`src/pages/admin/index.astro`:

```astro
---
return Astro.redirect("/admin/index.html");
---
```

`src/pages/admin/reset-password.astro`(保留邮件链接 URL 格式):

```astro
---
const token = Astro.url.searchParams.get("token");
return Astro.redirect(
	token ? `/admin/index.html#/reset-password?token=${encodeURIComponent(token)}` : "/admin/index.html",
);
---
```

原理:`public/admin/index.html` 是静态文件(不经 Astro 鉴权——鉴权由 API 层强制,SPA 首屏调 `/api/admin/me` 决定登录态);hash 路由由 SPA 接管。

- [ ] **Step 2: 构建链验证**

```bash
pnpm build
```

检查 `dist/admin/index.html` 存在、`dist/assets/*` 内 SPA 资源就位、`pnpm preview` 后 `/admin/` 可进入登录页。

- [ ] **Step 3: 端到端手动验证(preview 或 dev + browser-use 本地 Chrome)**

1. `http://127.0.0.1:4321/admin/` → 重定向到 SPA 登录页
2. 登录 → 文章/管理员/配置/统计/AI 总结全功能走查(Task 18 Step 7 清单重跑一遍)
3. `/admin/reset-password/?token=xxx` → SPA 重置页带 token
4. 重启 dev server(或 preview)后**登录态仍在**(session 落库验证)
5. `data/stats.db` 中 `sessions`、`rate_limits` 表有数据
6. 博客前台:首页/文章页正常、访问后统计增加
7. 安全回归:`/api/admin/posts` 无 cookie 401;连续错误登录 10 次后 429

- [ ] **Step 4: 全量质量检查**

```bash
pnpm check && pnpm test && pnpm lint
```

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "feat: 管理面板重写收尾——入口重定向、旧组件移除、构建链整合"
```

---

## Self-Review 结论

- **Spec 覆盖**:架构总览(Task 1/16/17)、目录结构(Task 1-15)、数据模型含新表(Task 2)、认证会话单一收口(Task 4/6/11)、限速规则含 stats/record 60次(Task 5/11/14)、API 契约与路径对齐(Task 11-15)、SPA 页面一一对应(Task 17-18)、测试策略(Task 2-15 各测试)、不变项(前台/文件存储/环境变量,Task 16/19 验证步骤)——全覆盖;两项确认变更(stats 限速 Task 14、POST posts 已存在故保留 Task 12)落实。
- **类型一致性**:`ok/fail`、`AppEnv`、`getDb()->{db,t}`、`Tables`、`api<T>`、`parseHash`、`navigate` 在各任务间签名一致。
- **已知留白**:Task 9 `dailyFrom` 实现示意有冗余分支,以测试通过为准做简化;属实现细节自由度,非规格缺失。
