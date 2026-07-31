---
title: "博客数据库迁移：从 SQLite 到 PostgreSQL + 1Panel 部署指南"
published: 2026-07-30
description: "记录博客后台管理系统的数据库架构升级，实现 SQLite 和 PostgreSQL 双数据库支持，以及在 1Panel 上的完整部署流程。"
tags:
  - PostgreSQL
  - SQLite
  - 部署
  - 1Panel
  - 数据库
category: "部署运维"
---

## 前言

对于个人博客来说，初期开发阶段用 SQLite 是最省心的选择——零配置、单文件、随拿随走。但当博客要正式上线、长期运行时，SQLite 的局限性就显现了：并发写入能力弱、不方便做远程备份、无法多实例共享。

我的博客项目（基于 Astro + Svelte）有一套后台管理系统，用于统计访问量、管理文章和 AI 摘要等功能。本地开发时一直用 SQLite，体验很好。但部署到 VPS 后，我需要一个更可靠的数据库方案。

于是我做了一个决定：**不是换掉 SQLite，而是同时支持 SQLite 和 PostgreSQL**，通过环境变量一键切换。开发时继续用 SQLite，生产环境切到 PostgreSQL。

这篇文章就记录整个过程的思路和部署步骤。

## 架构设计：数据库驱动层

### 接口抽象

核心思路很简单——定义一个数据库驱动接口 `DbDriver`，所有数据库操作都通过这个接口完成：

```typescript
export interface DbDriver {
  init(): Promise<void>;
  recordVisit(pagePath: string): Promise<void>;
  recordArticleView(slug: string): Promise<void>;
  getStats(range: "7d" | "30d" | "all"): Promise<{
    totalPageViews: number;
    totalArticleViews: number;
    dailyViews: { date: string; count: number }[];
    topArticles: { slug: string; count: number }[];
  }>;
  createAdmin(username: string, password: string): Promise<boolean>;
  verifyAdmin(username: string, password: string): Promise<boolean>;
  listAdmins(): Promise<{ id: number; username: string; createdAt: string }[]>;
  changePassword(username: string, newPassword: string): Promise<boolean>;
  deleteAdmin(username: string): Promise<boolean>;
  close(): Promise<void>;
}
```

### 两套驱动实现

基于这个接口，我分别实现了两个驱动：

- **SQLite 驱动**（`db-sqlite.ts`）—— 使用 `better-sqlite3`，数据存储在 `data/stats.db` 文件中
- **PostgreSQL 驱动**（`db-postgres.ts`）—— 使用 `pg` 库，通过连接字符串连接远程数据库

### 环境变量切换

通过 `DB_TYPE` 环境变量决定加载哪个驱动：

```bash
# DB_TYPE=sqlite（默认） → 使用 SQLite
# DB_TYPE=postgres       → 使用 PostgreSQL
```

这样上层代码完全不关心底层用的是哪个数据库，切换只需改一个环境变量。

## 本地开发：SQLite 模式

SQLite 模式是默认模式，**零配置即可使用**。

项目根目录下的 `.env` 文件中确保以下配置：

```env
DB_TYPE=sqlite
```

就这么简单。启动项目后，数据库文件会自动创建在 `data/stats.db`。首次启动时会自动建表并创建默认管理员账号（`admin` / `admin123`）。

本地开发完全不需要关心数据库安装和配置的问题，这是 SQLite 模式最大的优势。

## 迁移到 PostgreSQL

### 安装 PostgreSQL

如果你使用 1Panel 部署，可以直接在应用商店中搜索并安装 PostgreSQL，非常方便。其他方式（如系统包管理器安装）也可以，这里不展开。

### 创建数据库和用户

安装好 PostgreSQL 后，需要创建专用的数据库和用户。通过 `psql` 或 1Panel 的数据库管理界面操作：

```sql
CREATE USER fuwari_user WITH PASSWORD 'your_secure_password';
CREATE DATABASE fuwari_blog OWNER fuwari_user;
```

### 修改环境变量

在项目根目录创建或编辑 `.env` 文件：

```env
DB_TYPE=postgres
DATABASE_URL=postgresql://fuwari_user:your_password@localhost:5432/fuwari_blog
```

### 密码中特殊字符的 URL 编码

这里有一个容易踩的坑：`DATABASE_URL` 是一个连接字符串，如果密码中包含特殊字符，**必须进行 URL 编码**，否则连接会失败。

常见的需要编码的字符：

| 字符 | 编码 |
|------|------|
| `#`  | `%23` |
| `@`  | `%40` |
| `*`  | `%2A` |
| `!`  | `%21` |
| `$`  | `%24` |
| `%`  | `%25` |

举个例子，如果你的密码是 `my#pass@word`，那么连接字符串应该写成：

```env
DATABASE_URL=postgresql://fuwari_user:my%23pass%40word@localhost:5432/fuwari_blog
```

## 1Panel 部署完整步骤

下面是在 1Panel 上从零部署的完整流程。

### 前置条件

- 一台 Linux VPS（推荐 Ubuntu 22.04+）
- 已安装 1Panel（推荐从官网安装）
- Node.js 18+（可通过 1Panel 应用商店安装）
- PM2 进程管理器
- Nginx（1Panel 自带或应用商店安装）

### 第一步：安装 PostgreSQL

在 1Panel 面板中：

1. 进入 **应用商店** → 搜索 **PostgreSQL**
2. 选择合适的版本安装
3. 安装完成后记住默认端口（通常是 `5432`）和管理员密码

### 第二步：创建数据库

通过 1Panel 的数据库管理界面，或者 SSH 进入服务器用 `psql` 命令：

```sql
CREATE USER fuwari_user WITH PASSWORD 'your_secure_password';
CREATE DATABASE fuwari_blog OWNER fuwari_user;
GRANT ALL PRIVILEGES ON DATABASE fuwari_blog TO fuwari_user;
```

### 第三步：克隆项目并构建

```bash
# 克隆项目
git clone https://github.com/your-username/fuwari.git
cd fuwari

# 安装 pnpm（如果没有）
npm install -g pnpm

# 安装依赖
pnpm install

# 构建项目
pnpm build
```

### 第四步：配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
# 数据库配置
DB_TYPE=postgres
DATABASE_URL=postgresql://fuwari_user:your_secure_password@localhost:5432/fuwari_blog

# AI 摘要功能（可选）
OPENROUTER_API_KEY=your-key-here
```

### 第五步：配置 PM2

项目根目录已有 `ecosystem.config.js`：

```javascript
module.exports = {
  apps: [{
    name: 'fuwari-blog',
    script: 'dist/server/entry.mjs',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    env: {
      NODE_ENV: 'production',
      PORT: 4321,
      HOST: '0.0.0.0',
      DB_TYPE: 'postgres',
      DATABASE_URL: 'postgresql://fuwari_user:your_secure_password@localhost:5432/fuwari_blog'
    }
  }]
};
```

启动项目：

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # 设置开机自启
```

### 第六步：配置 Nginx 反向代理

在 1Panel 中创建网站，配置 Nginx 反向代理将域名指向本地服务：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:4321;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 第七步：在 1Panel 中添加网站

1. 进入 **网站** → **创建网站**
2. 填写域名（如 `your-domain.com`）
3. 选择 **反向代理** 模式
4. 代理地址填写 `http://127.0.0.1:4321`
5. 如需 HTTPS，可在 1Panel 中申请 Let's Encrypt 证书

完成后访问你的域名，应该能看到博客首页了。首次启动时会自动初始化数据库表和默认管理员。

## 环境变量参考

完整的 `.env` 配置示例：

```env
# 数据库类型：sqlite 或 postgres
DB_TYPE=postgres

# PostgreSQL 连接字符串
DATABASE_URL=postgresql://fuwari_user:your_secure_password@localhost:5432/fuwari_blog

# AI 摘要功能（可选）
OPENROUTER_API_KEY=your-key-here
```

## 切换回 SQLite

如果你想在本地切回 SQLite 模式，只需要修改一个环境变量：

```env
DB_TYPE=sqlite
```

不需要安装任何东西，不需要其他配置。重启项目后会自动使用 `data/stats.db` 文件作为数据库。

这种设计让你可以在开发和部署之间自由切换，非常灵活。

## 注意事项

### 连接字符串中的特殊字符

再强调一次：PostgreSQL 连接字符串中，密码部分如果包含 `#`、`@`、`*`、`!`、`$` 等特殊字符，**必须做 URL 编码**。这是一个很容易忽略但又很难排查的问题——连接失败时第一反应应该检查这里。

### 默认管理员账号

首次启动时（无论 SQLite 还是 PostgreSQL 模式），系统会自动创建默认管理员：

- 用户名：`admin`
- 密码：`admin123`

**部署到生产环境后，请立即修改默认密码！** 进入后台管理面板，在管理员管理页面修改密码。

### 数据迁移

目前 SQLite 和 PostgreSQL 之间**没有自动迁移工具**。如果你需要把本地 SQLite 的数据迁移到 PostgreSQL，需要手动操作：

1. 导出 SQLite 数据（可以用 `sqlite3` 命令行工具导出为 SQL 或 CSV）
2. 导入到 PostgreSQL（根据导出的格式用对应方式导入）

后续版本可能会考虑加入自动迁移功能。

### 端口与安全

- PostgreSQL 默认监听 `5432` 端口，生产环境建议**不要将数据库端口暴露到公网**
- 确保 VPS 防火墙只开放必要的端口（80、443）
- 数据库连接使用 `localhost` 即可，不需要走外网

## 总结

通过抽象数据库驱动接口，这个项目实现了 SQLite 和 PostgreSQL 的无缝切换：

- **开发阶段**：`DB_TYPE=sqlite`，零配置，`data/stats.db` 一个文件搞定
- **生产部署**：`DB_TYPE=postgres`，配合 1Panel 快速搭建 PostgreSQL + Node.js + Nginx 的完整环境

整个过程的核心改动集中在数据库驱动层，上层业务代码完全不需要修改。如果你也在用 Astro 搭建带后台功能的博客，这种双数据库支持的架构值得参考。

部署方面，1Panel 确实简化了不少工作——从数据库安装到 Nginx 配置，基本都能在面板里完成。配合 PM2 做进程管理，稳定性和可维护性都有保障。
