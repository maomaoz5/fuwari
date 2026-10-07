# 后端管理面板全栈重写设计

日期:2026-10-07
状态:已与用户逐节确认

## 背景与目标

现有后端(Astro API routes + utils/admin,约 35 文件 / 5100 行)存在以下结构性问题,维护成本高:

1. `db-sqlite.ts` 与 `db-postgres.ts` 两套手写 SQL 驱动约 90% 重复
2. 鉴权三重冗余:middleware 拦截 + 端点内 `validateAuth` + me/logout 手写
3. session 与限速器均为内存 Map,PM2 重启即全部失效
4. 每个端点手写 `new Response(JSON.stringify(...))` 样板,无统一响应/参数校验层
5. `captcha.ts` 314 行职责过重;登录流程中存在调试 console.log
6. 后端几乎零测试(API/中间件/认证/验证码/邮件全无),现有测试直接操作真实 `data/stats.db`

目标:功能完全对齐现状的前提下全栈重写后端与管理面板,消除上述问题。

## 决策记录

| 决策点 | 结论 |
|--------|------|
| 重写范围 | 全栈(后端 API + 管理面板 UI) |
| 技术路线 | Astro middleware 挂 Hono 接管全部 `/api/*`;管理面板为独立 Svelte SPA |
| 数据层 | Drizzle ORM 双引擎(better-sqlite3 / pg),`DB_TYPE` 环境变量切换 |
| 会话存储 | session 落库(新 `sessions` 表),重启不丢;限速器同落库 |
| 功能范围 | 与现状完全对齐,不增不减 |
| 行为变更(经确认) | ① `stats/record` 公开接口加 DB 限速防刷;② 补上缺失的 `POST /api/posts` 创建路由 |

## 架构总览

```
浏览器
  ├── 博客前台/SSR ──────→ Astro pages(不动)
  ├── /api/*  ──────────→ Astro middleware → Hono app(全部后端逻辑)
  └── /admin  ──────────→ Svelte SPA 静态产物(public/admin/,hash 路由)
```

- Hono 实例在 `src/middleware.ts` 中接管所有 `/api/*` 请求(`app.fetch(request)` 转发),删除现有 `src/pages/api/` 全部 20+ 分散文件
- Svelte SPA 用 Vite 单独构建,产物输出到 `public/admin/`,hash 路由——无需 OpenResty history fallback,部署方式(PM2 + OpenResty + Cloudflare CDN)完全不变
- 博客前台、构建期 AI 总结集成(`src/integrations/`)不动

## 后端目录结构

```
src/server/
├── app.ts              # Hono 入口:路由挂载、onError、中间件链
├── env.ts              # zod 集中解析所有环境变量/配置
├── db/
│   ├── schema.ts       # Drizzle schema
│   ├── index.ts        # 引擎工厂(DB_TYPE 切换 better-sqlite3 / pg)
│   └── migrations/     # drizzle-kit 迁移
├── middleware/          # auth(session) / rate-limit(DB)
├── routes/             # auth / posts / admins / config / stats / ai-summary
└── services/           # captcha / email / ai-providers / file-ops / config-store
```

### 数据模型

表结构直接映射现有表,零数据迁移:

- `admins`:现有结构(含 email/reset_token 列)
- `sessions`(新增):`token_hash`、`admin_id`、`expires_at`、`ip`、`user_agent`
- `page_views`、`article_views`:现有结构
- `rate_limits`(新增):`key`(如 `login:ip` / `forgot:username` / `stats:ip`)、`count`、`window_expires_at`,窗口过期时重置计数并顺带清理过期行

PBKDF2 600k 轮哈希与旧参数透明升级逻辑原样保留。

## 认证与会话

- 鉴权**只**在 Hono auth 中间件做一次:校验 `fuwari_session` cookie → 查 sessions 表(未过期)→ 注入 context;删除现有三重冗余
- 限速规则(逻辑对齐现状):
  - 登录:5 次 / 15min / IP
  - 忘记密码:3 次 / 15min
  - stats/record:新加,与登录同款机制(具体阈值实施时定,建议 60 次 / 15min / IP)
- Turnstile/hCaptcha 双 provider、防用户名枚举、Resend 无 key 降级 console 均保留,`captcha.ts` 拆为 provider 子模块
- 移除登录流程中的 console.log 调试输出

## API 契约

- 统一响应:`{ ok: true, data }` / `{ ok: false, error: { code, message } }`
- 每条路由 zod 校验入参,消灭 `request.json()` 裸解构
- 端点路径与现有对齐(`/api/auth`、`/api/auth/forgot-password`、`/api/auth/reset-password`、`/api/logout`、`/api/me`、`/api/captcha-config`、`/api/posts`、`/api/posts/:slug`、`/api/admins`、`/api/admins/:username`、`/api/config`、`/api/update-email`、`/api/stats`、`/api/stats/record`、`/api/ai-summary`、`/api/ai-summary/:slug`)
- 新增 `POST /api/posts` 创建文章(现状只能编辑已有 Markdown,创建/编辑齐全)
- `ai-summary/[slug]` POST 仍保持 501 占位(用户选择功能完全对齐现状)

## 管理面板 SPA

- Svelte 5 + TypeScript,页面与现有 7 个组件功能一一对应:登录、文章列表、文章编辑器、管理员管理、站点配置、统计、AI 总结
- 按路由分页面(hash router),共享一个 API client 模块(统一错误处理、401 自动跳登录)
- UI 视觉沿用现有风格,代码全新;拆掉 `AdminApp.svelte` 中登录 + tab 切换 + 状态的耦合

## 测试策略

- Hono `app.fetch()` 直接发请求做 API 集成测试,不起服务器
- Vitest 覆盖:API 集成测试(登录/文章 CRUD/配置/鉴权边界)、services 纯逻辑测试(哈希升级、限速窗口、token)
- 测试用内存 SQLite(`:memory:`),不再触碰真实 `data/stats.db`

## 不变的东西

- 博客前台全部页面与样式
- Markdown 文件存储(`src/content/posts/`)与 gray-matter 读写
- `data/config-overrides.json` 配置覆盖机制与白名单 key
- 所有环境变量(Turnstile sitekey、Resend、域名、DB_TYPE 等)与部署流程

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| Hono 中间件与 Astro middleware 集成边界问题 | 先做最小 spike 验证转发可行性,再全面迁移 |
| Drizzle 双引擎 SQL 方言差异 | 全部走 Drizzle 查询构建器,不写原生 SQL;集成测试双引擎各跑一遍(可行时) |
| SPA 构建接入现有 Vite/Astro 构建链 | 独立 vite.config + 构建脚本,产物进 `public/admin/`,不干扰主构建 |
| 现有数据兼容(admins 表、统计表) | 表结构零变更;迁移工具仅用于创建新表(sessions、rate_limits) |
