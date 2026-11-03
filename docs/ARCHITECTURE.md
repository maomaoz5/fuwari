# 架构说明

> 本文描述的是**当前工作区代码**（Hono + Drizzle 重写版）的真实结构，不是原版 fuwari 主题。
> 校对依据：本地源码 + 线上 `139.196.225.5:/root/fuwari` 运行产物。
> 最后更新：2026-11-02

---

## 1. 项目定位

一个基于 [fuwari](https://github.com/saicaca/fuwari) 二次开发的**静态博客 + 自建后台**站点，运行在 https://zidayo.com 。

在原主题「Astro 纯静态博客」的基础上，追加了四块能力：

| 能力 | 实现方式 |
|------|----------|
| 后台管理（文章 CRUD / 站点配置 / 管理员） | 独立 Vite + Svelte SPA + Hono API |
| 访问统计 | 前端埋点 → API → SQL 聚合 |
| AI 文章摘要 | 构建期批量调用 LLM，产出静态 JSON |
| 登录安全（验证码 / 限流 / 会话落库 / 邮件重置密码） | Turnstile+hCaptcha、DB 限流、sha256 会话、Resend |

前端页面仍然**预渲染**（`prerender = true`），只有 `/api/*` 与后台 SPA 是动态的。所以它是「静态站 + 旁挂 API」，而不是全 SSR 应用——这一点决定了后面所有流程。

---

## 2. 技术栈

- **框架**：Astro 5（`@astrojs/node` standalone 适配器）+ Svelte 5（islands / SPA）
- **样式**：Tailwind CSS 4 + Stylus（主题变量、markdown 扩展）
- **后端**：Hono 4（挂在 Astro middleware 上，`basePath = /api`）
- **数据层**：Drizzle ORM 0.45，双方言（`node-postgres` / `better-sqlite3`）
- **校验**：Zod 4
- **搜索**：Pagefind（构建后索引）
- **代码高亮**：Expressive Code（含折叠、行号、语言徽章、自定义复制按钮）
- **测试**：Vitest（`src/server/**/*.test.ts`、`src/utils/__tests__/`）
- **质量**：Biome（格式化 + lint）、`tsc --noEmit`
- **进程管理**：PM2（cluster，单实例）

---

## 3. 目录结构

```
.
├── astro.config.mjs          # Astro 配置：adapter/integrations/markdown 管线
├── ecosystem.config.cjs      # PM2 配置（含 DB 连接串）
├── pagefind.yml              # 搜索索引配置
├── data/
│   ├── config-overrides.json # 后台写入的配置覆盖层（持久化）
│   └── stats.db              # SQLite 模式下的库文件
├── public/
│   ├── admin/                # ← admin-spa 的构建产物（禁止手改）
│   └── ai-summaries/         # 构建期生成的 AI 摘要 JSON
├── scripts/                  # deploy-vps.sh（发布）、new-post.js、重置密码脚本
└── src/
    ├── middleware.ts         # ★ 总入口：/api 委托 Hono，HTML 注入主题变量
    ├── config.ts             # 站点默认配置（site/navBar/profile/license/aiSummary/captcha）
    ├── content.config.ts     # 文章集合 schema（Zod）
    ├── admin-spa/            # ★ 后台 SPA 源码（独立 Vite 项目）
    ├── server/               # ★ 后端主体
    │   ├── app.ts            # Hono 装配 + 全局错误/404 + 懒初始化
    │   ├── http.ts           # 统一响应壳 ok()/fail()
    │   ├── middleware/auth.ts# requireAuth
    │   ├── routes/           # 6 个路由组
    │   ├── services/         # 10 个领域服务
    │   └── db/               # Drizzle 双方言 schema + 连接管理
    ├── pages/                # Astro 页面（全部 prerender）
    ├── layouts/              # Layout.astro / MainGridLayout.astro
    ├── components/           # 主题组件 + Svelte islands
    ├── integrations/         # ai-summary 构建钩子
    ├── plugins/              # remark / rehype / expressive-code 插件
    ├── utils/                # 前端工具 + AI provider + AI 摘要缓存
    ├── i18n/                 # 10 种语言文案
    └── styles/               # main.css / variables.styl / markdown-extend.styl
```

关键约束：`public/admin/` 是构建产物，`pnpm build:admin` 会先 `emptyOutDir` 清空再写入。改后台只能改 `src/admin-spa/`。

---

## 4. 分层与依赖方向

```
浏览器
  │
  ▼
OpenResty (1Panel, TLS 终止, /_astro 静态直出)
  │
  ▼  127.0.0.1:4321
┌───────────────────────────────────────────────┐
│ PM2: fuwari-blog (Node standalone)            │
│                                               │
│  src/middleware.ts                            │
│    ├─ /api/*  ──────────► src/server/app.ts   │
│    │                        ├─ middleware/    │
│    │                        ├─ routes/        │
│    │                        └─ services/      │
│    │                              └─ db/ (Drizzle) │
│    └─ 其他     ──────────► Astro 页面层        │
│                             ├─ pages/         │
│                             ├─ layouts/       │
│                             └─ components/    │
└───────────────────────────────────────────────┘
  │                    │                  │
  ▼                    ▼                  ▼
文件系统            数据库            外部服务
posts/*.md      PostgreSQL/SQLite   AI / Resend / Turnstile
ai-summaries/
config-overrides.json
```

依赖规则（代码实际遵守的）：

- `routes/` 只依赖 `services/` 与 `http.ts`，**不直接碰 fs 或 db**（`ai-summary` 路由是唯一例外，直接读目录）
- `services/` 依赖 `db/` 与 `node:*`，不依赖 Hono 的 `Context`（除 `session` 的 cookie 辅助函数）
- `db/index.ts` 是唯一持有连接的地方；`getDb()` 返回 `{ db, t }`，`t` 是按当前方言选出的表对象
- Astro 页面层与后端**不共享运行时**，只共享 `src/config.ts` 这类纯数据模块

---

## 5. 后端：Hono 装配

`src/server/app.ts`：

```ts
const root = new Hono<AppEnv>({ strict: false });
const app = root.basePath("/api");
app.use("*", ensureInit);          // 首次请求：建表 + 可选建默认管理员
app.get("/__health", ...);
app.route("/", authRoutes);        // auth/posts/admins/config/stats/ai-summary
root.onError(...); root.notFound(...);
export const apiApp = createServerApp();
```

`ensureInit()` 用模块级 `initialized` 布尔做单次初始化：`getDb()`（自动建表）+ `ensureDefaultAdmin()`。后者只在 `import.meta.env.DEV` 或 `CREATE_DEFAULT_ADMIN=true` 时才创建 `admin / admin12345678`，生产环境默认跳过并打 warn。

### 5.1 路由清单

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET | `/api/__health` | — | 存活探针（无 IO） |
| GET | `/api/__ready` | — | 就绪探针：真打一次 DB，失败返回 503 |
| POST | `/api/admin/auth` | — | 登录（限流 10 次/15 分钟/IP） |
| POST | `/api/admin/auth/forgot-password` | — | 发重置邮件（限流 3 次/15 分钟/IP） |
| POST | `/api/admin/auth/reset-password` | — | 用 token 重置密码 |
| POST | `/api/admin/logout` | — | 吊销会话 + 清 cookie |
| GET | `/api/admin/me` | ✔ | 当前登录名 |
| GET | `/api/admin/captcha-config` | — | 公开的验证码配置（enabled/provider/siteKey） |
| GET/POST | `/api/admin/posts` | ✔ | 列表 / 新建 |
| GET/PUT/DELETE | `/api/admin/posts/:slug` | ✔ | 读 / 覆盖 / 删 |
| GET/POST | `/api/admin/admins` | ✔ | 管理员列表 / 新建 |
| PUT/DELETE | `/api/admin/admins/:username` | ✔ | 改密（需当前密码）/ 删除（需密码确认，且不能删最后一个） |
| GET/PUT | `/api/admin/config` | ✔ | 合并配置 / 写覆盖层（7 个白名单 key） |
| GET | `/api/admin/stats?range=7d\|30d\|all` | ✔ | 统计聚合 |
| POST | `/api/stats/record` | — | 公开埋点（限流 60 次/15 分钟/IP） |
| GET | `/api/admin/ai-summary` | ✔ | 摘要文件列表 |
| DELETE | `/api/admin/ai-summary/:slug` | ✔ | 删摘要 |
| POST | `/api/admin/ai-summary/:slug` | ✔ | 重新生成摘要（限流 10 次/15 分钟/账号） |

响应格式统一为 `{ ok: true, data }` / `{ ok: false, error: { code, message } }`（`src/server/http.ts`）。
唯一例外：`POST /api/stats/record` 返回 `{ success: true }`，为了兼容博客前端的旧埋点脚本。

### 5.2 服务层职责

| 文件 | 职责 | 关键点 |
|------|------|--------|
| `services/session.ts` | 会话签发/校验/吊销、cookie | token 是 UUID，**库里只存 `sha256(token)`**；TTL 24h；新建时顺手清理过期行 |
| `services/rate-limit.ts` | 固定窗口限流 | 落 `rate_limits` 表，`key = 场景:IP`；跨进程/重启有效 |
| `services/admins-repo.ts` | 管理员 CRUD、重置 token | 删除前 `countAdmins() <= 1` 直接拒绝 |
| `services/security.ts` | 常量、slug 校验、密码强度、PBKDF2 | 600k 轮 PBKDF2-SHA512；兼容 10k 轮旧哈希并**透明升级**；密码 ≥12 位 |
| `services/post-files.ts` | Markdown 文件读写 | `gray-matter` 解析；所有入口先过 `validateSlug` |
| `services/stats-repo.ts` | 埋点写入 + 聚合查询 | 原生 SQL；日期函数按方言切 `to_char` / `date()` |
| `services/config-store.ts` | 配置默认值 + 覆盖层深合并 | 默认值 `import("../../config.ts")`，覆盖层 `data/config-overrides.json` |
| `services/captcha.ts` | Turnstile / hCaptcha 校验 | provider 为 `none` 时整体跳过；错误码映射成可读中文 |
| `services/email.ts` | Resend 发重置邮件 | 无 `RESEND_API_KEY` 时降级为控制台打印链接 |

### 5.3 安全设计要点

- 路径穿越：`validateSlug` 先拒 `..` `/` `\`，再匹配 `^[a-z0-9]+(?:-[a-z0-9]+)*$`
- Cookie：`HttpOnly; SameSite=Strict; Secure`（DEV 关 Secure），`Path=/`
- Bearer token 兼容：`getTokenFromRequest` 先 cookie 后 `Authorization: Bearer`
- 防用户名枚举：忘记密码无论用户是否存在，都返回同一句提示
- 二级确认：改密要当前密码，删管理员要操作者密码
- 配置白名单：只允许 `site/navBar/profile/license/expressiveCode/aiSummary/captcha` 七个顶层 key

---

## 6. 数据层

`src/server/db/index.ts`：

- `getDialect()` 读 `DB_TYPE`，决定 `postgres` / `sqlite`
- `getDb()` 懒加载单例：PG 用 `pg.Pool`（max 5），SQLite 用 `data/stats.db`
- `ensureSchema()` 执行一段幂等 DDL（`CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`），**没有迁移框架**，改字段要手写 DDL
- `getTables()` 返回当前方言的 Drizzle 表对象，业务代码通过 `t.admins` 这种写法保持方言无关

### 表结构

| 表 | 字段 | 写入方 |
|----|------|--------|
| `admins` | id, username(uniq), password_hash, password_salt, created_at, email, reset_token, reset_token_expires | admins-repo |
| `sessions` | token_hash(PK), username, created_at, expires_at, ip, user_agent | session |
| `rate_limits` | key(PK), count, window_expires_at | rate-limit |
| `page_views` | id, path, visited_at | stats-repo |
| `article_views` | id, slug, visited_at | stats-repo |

索引：`page_views(visited_at)`、`article_views(visited_at)`、`article_views(slug)`。

时间统一以 ISO 字符串进出（schema 里 `timestamp(..., { mode: "string" })`），SQLite 侧天然是文本，PG 侧由驱动转换。

---

## 7. 前端层

### 7.1 Astro 页面层

| 页面 | 路径 | 渲染 |
|------|------|------|
| 首页（分页） | `src/pages/[...page].astro` | prerender |
| 文章页 | `src/pages/posts/[...slug].astro` | prerender |
| 归档 | `src/pages/archive.astro` | prerender |
| 关于 | `src/pages/about.astro` | prerender |
| RSS / robots / sitemap | `rss.xml.ts` / `robots.txt.ts` / `@astrojs/sitemap` | prerender |
| 后台入口 | `src/pages/admin/index.astro` | **仅 `redirect("/admin/index.html")`** |
| 重置密码页 | `src/pages/admin/reset-password.astro` | 动态壳，实际逻辑在 SPA |

`src/middleware.ts` 对非 `/api` 响应做两件事：补 `X-Content-Type-Options` / `X-Frame-Options`；若是 HTML，往 `</head>` 前注入 `<style>:root{--hue:...}</style>`。

Markdown 管线（`astro.config.mjs`）：

- remark：`math` → `reading-time` → `excerpt` → `github-admonitions` → `directive` → `sectionize` → `parseDirectiveNode`
- rehype：`katex` → `slug` → `rehypeComponents`（note/tip/warning/github 卡片）→ `autolink-headings`
- `remarkReadingTime` 会往 frontmatter 塞 `words` / `minutes`，`getSortedPosts()` 会补 `prevSlug/nextSlug`

### 7.2 后台 SPA

- 独立 Vite 项目：`base = /admin/`，输出到 `public/admin/`，开发端口 5175（`/api` 代理到 4321）
- 路由是 **hash 路由**：`#/login`、`#/posts`、`#/posts/<slug>`、`#/admins`、`#/config`、`#/stats`、`#/ai-summary`、`#/reset-password`
- `api.ts` 统一封装：自动补尾斜杠（`trailingSlash: "always"` 下无斜杠会被 301/404）；401 且不在公开页时跳 `#/login`
- `App.svelte` 启动时 `GET /api/admin/me` 判断 `authed`，`$effect` 负责「未登录踢回登录页 / 已登录跳出登录页」
- 页面组件：`Posts`、`PostEditor`、`Admins`、`Config`、`Stats`、`AiSummary`、`Login`、`ResetPassword`
- 验证码：`Captcha.svelte` 先查 `/api/admin/captcha-config`，再动态加载 Cloudflare/hCaptcha 脚本。

> ⚠️ **渲染时机陷阱**：容器由 `{#if info?.enabled}` 控制，`info` 赋值后必须 `await tick()`
> 再读 `bind:this` 的容器引用。否则容器是 `undefined`，函数直接 return，验证框永远不出现
> 且没有任何报错——2026-11-03 的「开了 Turnstile 但不弹框」就是这个原因。

#### 验证码密钥在哪配

| 项 | 位置 | 说明 |
|----|------|------|
| Site Key | 后台「站点配置」→ 验证码 | 公开值，写进页面，存在 `config-overrides.json` |
| Secret Key | 服务器环境变量 `TURNSTILE_SECRET_KEY` / `HCAPTCHA_SECRET_KEY` | **故意不放进 UI**，避免泄露；由 `.env.production` 注入 |

Secret 是否有效可用假 token 自测：
`curl -s -X POST https://challenges.cloudflare.com/turnstile/v0/siteverify -d "secret=$SECRET" -d "response=XXXX"`
返回 `invalid-input-response` 表示 secret 有效；`invalid-input-secret` 才说明密钥写错。

---

## 8. 关键运行流程

### 8.1 访客看文章

```
GET /posts/why-astro/
 → OpenResty 反代 :4321
 → middleware：非 /api，走 next()
 → Astro 直接吐 prerender 的静态 HTML（构建期已生成）
 → 浏览器加载 /_astro/*（nginx 直出） + islands 水合
 → 页面内联脚本 POST /api/stats/record { type:"article", slug }
 → Hono: 限流 → recordArticleView + recordVisit
```

注意：文章页 HTML 是**构建期**产物，后台改完 md 必须重新构建才生效。

### 8.2 后台登录

```
#/login → POST /api/admin/auth { username, password, captchaToken }
 → checkRateLimit("login:<ip>", 10, 15min)
 → verifyCaptcha：provider 为 none 直接跳过，否则调 siteverify
 → verifyAdmin → PBKDF2 校验（命中旧轮数则透明升级哈希）
 → createSession → 插 sessions(sha256(token))
 → Set-Cookie: fuwari_session=<uuid>; HttpOnly; SameSite=Strict; Secure; Max-Age=86400
 → 前端 navigate("#/posts")
```

后续任意受保护请求：`requireAuth` → `getTokenFromRequest` → `validateSession`（哈希比对 + 过期清理）→ `c.set("username", ...)`。

### 8.3 后台编辑文章

```
PostEditor → PUT /api/admin/posts/:slug { frontmatter, content }
 → requireAuth
 → validateSlug
 → writePost()：gray-matter.stringify → 覆盖 src/content/posts/<slug>.md
```

只写文件，**不触发重建**。发布流程见第 9 节。

### 8.4 站点配置

```
Config 面板 → PUT /api/admin/config { site: {...} }
 → 白名单校验 → writeOverrides() 落 data/config-overrides.json
 → GET 时 getMergedConfig()：config.ts 默认值 deepMerge 覆盖层
```

因为 Astro 页面构建期读的是 `src/config.ts`（不含覆盖层），**覆盖层主要影响后台/API 行为（如 captcha provider、aiSummary 参数）**；要让站点标题等改动上页面，同样需要重新构建，或者把 `getMergedConfig()` 引入页面层（目前没有）。

### 8.5 AI 摘要（构建期）

```
astro:build:start
 → 读 aiSummaryConfig.enable 与 provider 对应 API Key（无 key 直接跳过）
 → 扫 src/content/posts/*.md，跳过 draft
 → 逐篇：内容 hash 命中 public/ai-summaries/<slug>.json 则跳过
 → 调 provider（openrouter / openai 兼容 / custom），间隔 3s
 → 429 退避 30s/60s/120s，最多 3 次
 → 写缓存 JSON
```

前端 `AiSummaryModal.svelte` 点击时才 `fetch("/ai-summaries/<slug>.json")`，再用按标点调速的打字机效果逐字渲染。

---

## 9. 构建与发布

### 9.1 构建

```bash
pnpm install
pnpm build        # = build:admin && astro build && pagefind --site dist
```

顺序很关键：
1. `build:admin` → Vite 打 SPA 到 `public/admin/`（会先清空该目录）
2. `astro build` → 预渲染页面 + SSR 服务端到 `dist/`，并把 `public/` 原样拷进 `dist/client/`
3. `pagefind` → 为 `dist/` 生成搜索索引 `dist/pagefind/`

只改文章/配置、没动后台代码时，用 `pnpm build:site`（跳过 SPA 那 9 秒），
它等于 `astro build && pagefind --site dist`，但**前提是 `public/admin/` 已是新产物**。

#### 实测耗时（Windows / G 盘，5 篇文章，116 项测试通过）

| 阶段 | 耗时 | 说明 |
|------|------|------|
| `build:admin` | ~8.7 s | Vite + Svelte，产物 93 KB |
| `astro build` | 21–29 s | 波动来自磁盘缓存；含 9 页预渲染与客户端/服务端双打包 |
| `pagefind` | 1.2–6.4 s | 索引很小，耗时主要是冷启动 |
| **合计 `pnpm build`** | **~36 s** | 一次实测 35.7 s |

#### 已经踩过并修掉的“隐性耗时”

构建期 AI 摘要原先**每次构建都会重调 5 次模型**，原因不是缓存目录写错，而是两处解析方式不一致：

- `src/integrations/ai-summary.ts` 手写正则 `/^---\n/`，遇到 **CRLF** 文件（`---\r\n`）匹配失败，
  于是 `title` 变成空字符串、正文把 frontmatter 一起发给模型
- 后台走 `gray-matter`，正文不含 frontmatter

两边算出的内容 hash 永远不同 → 缓存永远判不中 → 每次构建 5 次 API 调用 + 每次间隔 3 s。
现已统一为 `gray-matter`，缓存稳定命中，构建日志出现 5 行 `Cached, skipping`。

> 已试过但**无效**、不要重复尝试的优化：把 `astro-icon` 的 `include` 从 `"*"` 收窄为显式列表。
> 实测构建耗时无变化、产物体积无变化（图标由 `@iconify-json` 按需解析，不是瓶颈），
> 反而会让以后新增图标静默失效。已回退。

**仍可优化的方向**（未做，按收益排序）：
1. 后台 SPA 变更频率低，可在发布脚本里加 `--skip-admin` 省 ~9 s
2. 10 种 i18n 语言全量打包，只保留实际使用的语言可减小客户端体积
3. Windows Defender 实时扫描对 `node_modules` 的读取影响明显，排除项目目录可提速

### 9.2 线上形态

| 项 | 值 |
|----|-----|
| 服务器 | `139.196.225.5`（SSH 别名 `vps`，root） |
| 应用目录 | `/root/fuwari` |
| 进程 | PM2 `fuwari-blog` → `dist/server/entry.mjs`，`PORT=4321` |
| 反代 | OpenResty 容器 `1Panel-openresty-Y3u4`，站点 `www.zidayo.com` |
| 站点 conf | `/opt/1panel/1panel/www/conf.d/zidayo.com.conf` |
| 数据库 | `1Panel-postgresql-r2dg`（postgres:18.6-alpine），库 `fuwari_blog` |
| 静态直出 | `/_astro/`、`/favicon/`、`/pagefind/` 由 nginx 提供，30 天缓存 |
| 静态镜像目录 | `/opt/1panel/1panel/www/sites/zidayo.com/app-dist/`（容器内 `/www/sites/zidayo.com/app-dist`） |
| 其余请求 | `proxy_pass 127.0.0.1:4321` |

⚠️ **路径陷阱**：宿主上还有一个 `/www/sites/zidayo.com/`（旧部署残留），但 nginx 容器挂载的是
`/opt/1panel/1panel/www` → `/www`。写在宿主 `/www` 下的文件容器看不见，两个 `/www` 不是同一棵树。

### 9.3 发布

统一走脚本，**不要手工 rsync**：

```bash
bash scripts/deploy-vps.sh           # 用现有 dist 发布
bash scripts/deploy-vps.sh --build   # 先 pnpm build 再发布
```

脚本做的事（顺序即安全边界）：

1. 校验 `dist/server/entry.mjs` 存在
2. `tar | ssh` 上传 dist 到 `dist.new`，再 `dist → dist.old`、`dist.new → dist`（原子切换）
3. 上传 `src/content/posts`、`public/ai-summaries`（`rsync --ignore-existing`，**默认不覆盖线上同名较新文件**）
4. 服务器端 `rsync -a --delete /root/fuwari/dist/ <静态镜像>` 并 `chown 1panel:1panel`
5. `pm2 start /root/fuwari/ecosystem.config.cjs --update-env`
   （**不能**用 `pm2 restart <name> --update-env`：那样会按当前 shell 环境刷新，可能冲掉 `.env.production` 注入的变量）
6. 回归验证 8 项：存活探针 / 就绪探针（DB）/ 首页 / 后台 SPA / 未鉴权 401 / 首页 CSS / 搜索索引 / 文章页

参数：`--build` 先构建；`--force-content` 才用本地文章/摘要覆盖线上同名文件。

> ⚠️ **`data/config-overrides.json` 归服务器所有，发布脚本永不上传。**
> 它是后台「站点配置」写入的运行态数据（含验证码 provider/siteKey 等）。
> 2026-11-03 曾因脚本上传本地旧副本，把线上配置覆盖回 `provider: none`，
> 表现为「后台开了 Turnstile，登录页却不显示验证框」。排查这类问题时先看这个文件。

### 9.4 按需发布（后台一键重建）

文章页是 `prerender`，后台改的是 md 文件，**改完不会自动上线**。为此服务器保留一份
可构建的 git 克隆，后台点「构建并发布」即可重建并上线。

```
POST /api/admin/rebuild   → setsid 启动 /root/fuwari-build/rebuild.sh
GET  /api/admin/rebuild   → { running, tail }（tail 为日志尾部 4KB）
```

脚本流程（约 30–60 秒）：

1. `git fetch` + `reset --hard origin/main`（**失败/超时降级**：用现有版本继续，不阻断发布）
2. 从 `/root/fuwari/src/content/posts` 同步文章到构建目录（`--delete` 镜像）
3. 同步 `public/ai-summaries`（保留服务器上已生成的较新摘要）
4. `pnpm build`
5. 原子替换 `dist`（失败则保留原版本）
6. `rsync` 到 nginx 镜像 + `chown 1panel:1panel`
7. `pm2 restart`，写 `=== 重建完成 ===`

限制与注意：

- 限流 **3 次/15 分钟**，并发时返回 409（脚本内有 `flock`）
- 脚本用 `setsid` 启动，否则它自己的 `pm2 restart` 会把脚本一起杀掉
- 构建目录 `/root/fuwari-build` 约 700 MB（node_modules），服务器内存峰值约 1.5 G，靠 swap 兜底
- **代码改动必须先 push**：构建目录构建的是 `origin/main`，服务器上没有源码
- 服务器访问 GitHub 不稳定（偶发 `SSL_ERROR_SYSCALL`），已做超时降级

> 本地 `scripts/deploy-vps.sh` 仍是主发布通道（改代码后走它）；
> 后台「构建并发布」只适合改文章/配置这类内容变更。

### 9.5 运维：备份与日志

| 项 | 配置 |
|----|------|
| 数据库备份 | `cron 0 3 * * *` → `/root/fuwari-backups/backup.sh`，`pg_dump` + gzip，保留 7 天，目录 700 |
| 备份校验 | 已做恢复演练：临时库恢复后 admins/page_views/article_views 数量一致 |
| PM2 日志 | `pm2-logrotate` 3.0.0，单文件 10 MB，保留 7 份，压缩，每日轮转 |

失败时上一版保留在 `/root/fuwari/dist.old`，脚本会打印回滚命令。

> 为什么静态资源要单独镜像：`pagefind` 生成在 `dist/pagefind/`，与 `dist/client/` 平级，
> Node 的静态服务根是 `dist/client`，**不包含 pagefind**。所以不能把静态请求全丢给 Node，
> 必须由 nginx 指向镜像目录；镜像由脚本保证与 `dist` 逐字节一致。

> ⚠️ **摘要会被覆盖**：`public/ai-summaries/` 由本地构建产物上传，后台“重新生成”写的是服务器上的文件。
> 若在后台生成过摘要，下次发布前请先把它拉回本地，否则会被旧版本覆盖。

---

## 10. 已知风险与整改

> 10.1 / 10.2 / 10.4 / 10.5 已于 2026-11-02 处理完毕，10.3 已加探针。下面保留结论与操作记录，便于回溯。

### 10.1 【已修复】服务器源码与运行产物不是同一版本

处理前：`/root/fuwari/src` 是旧架构（Astro API Routes + `utils/admin/*` + 内存会话），
运行中的 `dist` 却是新架构（Hono + Drizzle）从本机构建后上传的。判定依据：`dist` 里有
`admins-repo_*.mjs` 与 `token_hash`；库里有 `sessions` / `rate_limits` 表；`dist` 属主是 Windows UID `197609`。

风险：任何人在服务器上 `pnpm build`，都会产出旧架构产物，后台退回内存会话。

**已处理**：把 `src/` 下除 `content/` 外的目录整体移到 `src.stale-20261102/`，
保留 `src/content/posts/`（后台运行时通过 `process.cwd()/src/content/posts` 读写文章，不能动），
并写入 `/root/fuwari/DEPLOY-ONLY.md` 说明该目录只部署不构建。现在误执行 build 会直接失败，而不是安静地产出错的东西。

### 10.2 【已修复】静态资源双源

处理前：`/_astro/` 的 nginx root 指向 `/www/sites/zidayo.com/index/dist/client`（10-06 旧构建），
而 PM2 跑 `/root/fuwari/dist`（10-07）。当时两边 158 个文件恰好同名同内容，属于“下次发布必炸”的定时炸弹。

**已处理**：新建专用镜像目录 `/opt/1panel/1panel/www/sites/zidayo.com/app-dist/`，
nginx 三处静态 root 全部改指向该目录（`app-dist/client` 与 `app-dist`），
由 `scripts/deploy-vps.sh` 每次发布时 `rsync --delete` 同步。旧的 `index/dist` 不再被引用。

> 曾考虑“删掉静态 location 全部交给 Node”，实测不可行：`/pagefind/pagefind.js` 与 `/favicon` 在 Node 侧 404，
> 因为 `dist/client` 不包含 `dist/pagefind`。此方案已否决，勿再尝试。

### 10.3 【部分处理】会话与限流强依赖数据库

`sessions` / `rate_limits` 都在库里，PG 一挂，后台登录、限流、埋点全挂，没有降级。
这是有意取舍（库挂时后台本就不该可用），不做内存降级。

**已处理**：新增 `/api/__ready` 就绪探针，真实执行一次 `select ... limit 1`，库不可用时返回 503 并记日志；
`/api/__health` 保持零 IO 的存活语义。两者分工明确，部署脚本两者都校验。
外部监控应指向 `__ready` 而非 `__health`。

### 10.4 【已修复】数据库口令明文

处理前：`ecosystem.config.cjs` 里直接写着 `DATABASE_URL=postgresql://user:password@...`。

**已处理**：`ecosystem.config.cjs` 改为从同目录的 `.env.production` 读取并合并环境变量，
文件权限 `600`、属主 root、不进版本库（`.gitignore` 已含 `.env.production`）。
另外加了启动守卫：`DB_TYPE=postgres` 但缺 `DATABASE_URL` 时直接抛错，不会带着空配置静默启动。

### 10.5 【已修复】AI 摘要无法现场重生成

处理前：`POST /api/admin/ai-summary/:slug` 恒返回 501，改完文章只能删 JSON 再重新构建。

**已处理**：
- 新增 `src/server/services/ai-summary.ts`，复用 `generateSummary`，内容取自当前 md 文件，写入缓存 JSON
- `src/utils/ai-summary.ts` 的 `resolveEnv()` 改为「`.env` 文件 + `process.env`」合并，`process.env` 优先，
  解决了运行时读不到 key 的问题（vite 不可用时静默退化为仅 `process.env`）
- 路由按错误类型分流：404 文章不存在 / 400 未启用或缺 key / 502 provider 失败；并加 10 次/15 分钟限流
- 后台「重新生成」按钮接上真实调用，带 loading 态与结果提示

实测：线上对 `why-astro` 触发一次生成，4 秒返回并正确落盘。

两个配套修复（否则功能“看着成功、实际有害”）：

- **空内容不落盘**：OpenRouter 自由路由偶尔只返回 reasoning、`content` 为 `null`。
  原先会把 `{"summary": null}` 写进缓存覆盖好数据。现在 `ai-providers.ts` 校验非空、
  重试 2 次（1.5s/3s），仍为空则抛错 → 接口返回 502，旧缓存保持不动。
- **前台立即可见**：前台读的是 `dist/client/ai-summaries/`，后台写的是 `public/ai-summaries/`，
  只写前者需要重新构建才生效。现在生成/删除都会同步镜像到 `dist/client/ai-summaries/`
  （测试或自定义 `AI_SUMMARIES_DIR` 时不镜像，避免污染构建产物）。

### 10.6 【低】配置覆盖层不影响页面

`src/config.ts` 是构建期常量，`data/config-overrides.json` 只在 API/后台生效。若希望后台改标题立刻生效，需要把页面层也改成读 `getMergedConfig()`，或接受“改完要重建”。

---

## 11. 环境变量

**生产环境的变量来源**：`/root/fuwari/.env.production`（权限 600，不进库），
由 `ecosystem.config.cjs` 在 PM2 启动时解析并注入进程。改完需 `pm2 start ecosystem.config.cjs --update-env` 才生效。

| 变量 | 必填 | 说明 |
|------|------|------|
| `DB_TYPE` | 否 | `sqlite`（默认）/ `postgres` |
| `DATABASE_URL` | PG 时必填 | `postgresql://user:pass@host:5432/db` |
| `PORT` / `HOST` | 否 | 默认 4321 / 0.0.0.0 |
| `OPENROUTER_API_KEY` | AI 摘要 | `provider=openrouter` 时使用 |
| `OPENAI_API_KEY` | AI 摘要 | `provider=openai` 时使用 |
| `CUSTOM_AI_API_KEY` / `CUSTOM_AI_BASE_URL` | AI 摘要 | `provider=custom` 时使用 |
| `TURNSTILE_SECRET_KEY` | 验证码 | Turnstile 服务端密钥 |
| `HCAPTCHA_SECRET_KEY` | 验证码 | hCaptcha 服务端密钥 |
| `RESEND_API_KEY` / `SMTP_FROM` | 邮件 | 缺省时重置链接只打日志 |
| `SITE_URL` | 邮件 | 拼重置链接，默认 `http://localhost:4321` |
| `CREATE_DEFAULT_ADMIN` | 否 | `true` 时生产环境也建 `admin/admin12345678` |
| `POSTS_DIR` / `AI_SUMMARIES_DIR` / `CONFIG_OVERRIDES_PATH` | 否 | 覆盖默认路径（测试用） |

---

## 12. 本地开发

**包管理器**：pnpm 12.16.1（由 `package.json` 的 `packageManager` 字段锁定，corepack 会自动切换版本）。

pnpm 12 的两条硬约束，改配置前务必知道：

1. **配置只在 `pnpm-workspace.yaml`**：`package.json` 的 `pnpm` 字段已废弃（9.14 起告警），
   `overrides` / `allowBuilds` 都写进 workspace 文件。
2. **依赖默认不允许执行安装脚本**：原生模块必须列入 `allowBuilds`（映射形式，值为 `true`），
   否则 `better-sqlite3`、`sharp`、`esbuild` 不会编译，表现为测试或构建莫名失败。
   注意键名是 `allowBuilds`，旧的 `onlyBuiltDependencies` 在 12 里不再生效。

```bash
pnpm dev          # Astro dev server（未在配置里指定端口，即默认 4321）
pnpm dev:admin    # 后台 SPA，端口 5175
pnpm test         # Vitest
pnpm check        # tsc --noEmit
pnpm lint         # biome check --write ./src
```

⚠️ 开发态端口已统一：`src/admin-spa/vite.config.ts` 的 `/api` 代理指向 4321，与 `pnpm dev` 默认端口一致。
（历史问题：曾指向 4322，导致 `pnpm dev:admin` 拿不到 API。）

开发态 `DB_TYPE` 留空即走 SQLite（`data/stats.db`），无需起 PG；首次访问 `/api/*` 会自动建表，`DEV` 下还会自动建 `admin/admin12345678`（`.env` 里的 `CREATE_DEFAULT_ADMIN=true` 会让生产环境也建，注意别带到线上）。
