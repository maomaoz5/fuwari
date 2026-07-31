# 🍥 Fuwari 个人博客

基于 [Fuwari](https://github.com/saicaca/fuwari) 模板二次开发的独立博客系统，使用 [Astro](https://astro.build) + [Tailwind CSS](https://tailwindcss.com) 构建。在原版基础上大幅扩展，新增了完整的后台管理面板、数据库兼容层、AI 总结等功能，已发展为独立的项目。

![Node.js >= 20](https://img.shields.io/badge/node.js-%3E%3D20-brightgreen)
![pnpm >= 9](https://img.shields.io/badge/pnpm-%3E%3D9-blue)

## ✨ 功能特性

- 基于 Astro 静态生成，速度极快
- 明暗主题切换、响应式设计
- 自定义主题色与横幅
- [Pagefind](https://pagefind.app/) 全文搜索
- 平滑动画与页面过渡（Swup）
- 增强代码块（Expressive Code）、目录、RSS、KaTeX 数学公式
- **后台管理面板** — 完整的站点管理能力（详见下方）
- **SQLite / PostgreSQL 双数据库支持** — 通过环境变量一键切换
- **AI 文章总结** — 集成 OpenRouter API，自动生成文章摘要

## 🚀 快速开始

```sh
# 1. 安装依赖
pnpm install

# 2. 复制环境变量文件并按需修改
cp .env.example .env

# 3. 编辑站点配置
# 修改 src/config.ts 自定义博客信息

# 4. 启动开发服务器
pnpm dev

# 5. 创建新文章
pnpm new-post <文件名>
```

开发服务器默认运行在 `localhost:4321`。

## 📝 文章 Frontmatter

```yaml
---
title: 我的第一篇博客
published: 2023-09-09
description: 这是我的新博客的第一篇文章。
image: ./cover.jpg
tags: [前端, 教程]
category: 技术
draft: false
lang: zh_CN      # 仅在文章语言与站点语言不同时设置
---
```

## 🧩 Markdown 扩展语法

除 Astro 默认支持的 [GitHub Flavored Markdown](https://github.github.com/gfm/) 外，还增加了以下扩展：

- **Admonitions（提示框）** — 支持 note、tip、warning、danger 等多种类型
- **GitHub 仓库卡片** — 在文章中嵌入 GitHub 仓库链接卡片
- **增强代码块** — 基于 [Expressive Code](https://expressive-code.com/)，支持行号、折叠、自定义主题等

## 🔧 后台管理

访问 `/admin/` 进入后台管理面板，顶部导航栏也提供了管理入口。

| 功能         | 说明                                           |
|:-------------|:-----------------------------------------------|
| 文章管理     | 创建、编辑、删除文章，支持草稿                  |
| 站点配置     | 可视化修改博客标题、描述、社交链接等配置         |
| AI 总结      | 基于 OpenRouter API 为文章生成 AI 摘要          |
| 数据统计     | 页面访问量与文章阅读量统计                      |
| 管理员管理   | 支持多管理员、修改密码                          |
| 登录认证     | PBKDF2 哈希加密，安全可靠                      |
| 移动端适配   | 手机端响应式布局，随时随地管理                  |

## 🗄️ 数据库配置

通过环境变量 `DB_TYPE` 切换数据库类型：

**SQLite（默认，零配置）**
```env
DB_TYPE=sqlite
```
数据存储在 `data/stats.db`，开箱即用，适合开发和个人使用。

**PostgreSQL（生产环境）**
```env
DB_TYPE=postgres
DATABASE_URL=postgresql://user:password@localhost:5432/fuwari_blog
```

## 📦 部署指南

本项目采用 **VPS + 1Panel + PM2 + Nginx** 方案部署：

1. `pnpm build` 构建静态站点
2. PM2 运行 Astro 服务端（后台 API 需要 Node 运行时）
3. Nginx 反向代理并处理静态文件
4. 可通过 1Panel 面板统一管理

## ⚡ 命令

| 命令                     | 说明                                  |
|:-------------------------|:--------------------------------------|
| `pnpm install`           | 安装依赖                              |
| `pnpm dev`               | 启动本地开发服务器                    |
| `pnpm build`             | 构建生产站点并生成搜索索引            |
| `pnpm preview`           | 本地预览构建结果                      |
| `pnpm check`             | 代码检查                              |
| `pnpm format`            | 使用 Biome 格式化代码                 |
| `pnpm lint`              | 使用 Biome 检查并自动修复             |
| `pnpm test`              | 运行测试                              |
| `pnpm new-post <文件名>` | 创建新文章                            |

## 🙏 致谢

- [saicaca/fuwari](https://github.com/saicaca/fuwari) — 原始博客模板，提供了优秀的设计与基础功能
- [Astro](https://astro.build) — 现代化的静态站点生成框架
- [Tailwind CSS](https://tailwindcss.com) — 实用优先的 CSS 框架
- [Pagefind](https://pagefind.app/) — 静态站点全文搜索
- [Expressive Code](https://expressive-code.com/) — 代码块增强

## 📄 许可证

基于 [MIT](https://github.com/saicaca/fuwari/blob/main/LICENSE) 许可证开源。
