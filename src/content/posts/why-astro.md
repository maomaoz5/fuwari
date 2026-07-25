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

Astro 的输出是标准的静态文件，可以部署到任何支持静态托管的平台。我目前部署在 Vercel 上，每次 `git push` 后自动构建，全程零配置。

## 一些不足

当然，Astro 也不是完美的：

- **生态相对年轻**：相比 Next.js，Astro 的插件和社区资源还比较少
- **学习成本**：模板语法需要一定时间适应，尤其是从 React/Vue 转过来的开发者
- **SSR 支持有限**：虽然 Astro 4.0 开始支持 SSR，但这并非它的强项

## 总结

如果你的需求是构建一个**以内容为核心**的网站——博客、文档站、作品集——Astro 几乎是目前最优的选择。它在性能和开发体验之间找到了一个很好的平衡点。
