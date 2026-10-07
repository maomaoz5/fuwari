---
title: "为什么我选择 Astro 构建个人博客"
published: 2025-05-20
description: "在尝试了多种静态站点生成器之后，我最终选择了 Astro。这篇文章分享我的选型思路和 Astro 的核心优势。"
tags:
  - Astro
  - 静态站点
  - 博客
  - 性能优化
category: "技术选型"
---

## 背景

去年我决定重新搭建个人博客，核心诉求很简单：**加载快、写作体验好、部署方便**。在对比了 Hugo、Next.js、Hexo 等方案后，我最终选择了 Astro。

## Astro 的核心优势

### 1. 零 JavaScript 默认输出

Astro 最吸引我的特性是"默认零 JS"。它会将模板编译为纯 HTML，不会向浏览器发送不必要的 JavaScript 代码。这对于以内容为主的博客来说至关重要。

根据官方数据，Astro 站点平均比同功能的 Next.js 站点快 **40%** 以上。

### 2. 岛屿架构

Astro 独创的"岛屿（Islands）"架构允许你在静态页面中嵌入交互式组件，而且这些组件可以来自不同的框架：

```astro
---
import ReactCounter from '../components/ReactCounter.jsx';
import SvelteTimer from '../components/SvelteTimer.svelte';
---

<!-- 两个独立的交互岛屿 -->
<ReactCounter client:load />
<SvelteTimer client:visible />
```

这意味着你可以在同一个页面中混用 React、Vue、Svelte 组件，按需加载，互不干扰。

### 3. 基于内容集合的类型安全

Astro 的内容集合（Content Collections）基于 Zod 做 schema 校验，在构建时就能发现 frontmatter 中的错误：

```typescript
// content/config.ts
import { defineCollection, z } from "astro:content";

const posts = defineCollection({
  schema: z.object({
    title: z.string(),
    published: z.date(),
    draft: z.boolean().optional(),
  }),
});
```

如果你漏写了 `title` 字段，构建时就会报错，而不是等到线上才发现问题。

### 4. 强大的 Markdown 支持

Astro 内置了对 Markdown 的全面支持，包括 frontmatter 解析、自动目录生成、以及通过 rehype/remark 插件扩展的能力。你可以轻松添加代码高亮、数学公式、自定义容器等功能。

### 5. 部署灵活

Astro 最实用的一点是它同时支持**静态输出**和**服务端渲染（SSR）**两种模式。纯内容站可以编译成静态文件丢到任意托管平台；而当我需要动态能力（后台管理、访问统计、评论、AI 摘要）时，可以开启 SSR / 混合模式，用内置的 Node 适配器把站点跑成一个 Node 服务。

我的博客最初确实是纯静态部署，后来加上了自己的管理后台后切到了 SSR。目前用 Astro 7 的 Node standalone 适配器，部署在自建的 VPS 上：1Panel 管理 + PM2 守护进程 + OpenResty 反向代理 + Cloudflare CDN。虽然是自己运维，但 Astro 让"从静态平滑升级到动态"这件事几乎没有断层。

## 一些不足

当然，Astro 也不是完美的：

- **生态仍在完善**：相比 Next.js，Astro 的第三方插件和现成模板数量还是少一些
- **学习成本**：模板语法需要一定时间适应，尤其是从 React/Vue 转过来的开发者
- **动态能力依赖适配器**：Astro 的 SSR / 混合渲染已经比较成熟（我这整站就是 Astro 7 SSR + Hono 后端在跑），但重度动态交互的场景，社区资源和心智模型仍不如 Next.js 丰富

## 总结

如果你的需求是构建一个**以内容为核心**的网站——博客、文档站、作品集——Astro 几乎是目前最优的选择。它在性能和开发体验之间找到了一个很好的平衡点。
