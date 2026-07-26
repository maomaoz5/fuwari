---
title: "用 Biome 统一你的前端工具链"
published: 2025-09-12
description: "介绍 Biome 这个新兴的前端工具，看它如何用一个工具替代 ESLint + Prettier 的组合。"
tags:
  - Biome
  - 工具链
  - 代码质量
  - 前端工程化
category: "工具推荐"
---

## 痛点：工具链碎片化

前端项目的工具链通常是这样的：

- **ESLint**：代码检查
- **Prettier**：代码格式化
- **stylelint**：样式检查

三个工具，三套配置，三种运行方式。更麻烦的是，ESLint 和 Prettier 之间经常产生规则冲突，你需要额外安装 `eslint-config-prettier` 来协调。

有没有一个工具能统一这些功能？**Biome** 就是为此而生的。

## Biome 是什么

[Biome](https://biomejs.dev/) 是一个用 Rust 编写的高性能前端工具链，它同时提供了：

- **Linter**：代码质量检查
- **Formatter**：代码格式化
- **Import Sorter**：导入语句排序

一个工具，一套配置，一次安装。

## 性能对比

Biome 最直观的优势是**快**。官方基准测试显示：

| 操作 | ESLint + Prettier | Biome |
|------|-------------------|-------|
| 格式化 1000 个文件 | ~12s | ~0.3s |
| 检查 1000 个文件 | ~8s | ~0.4s |

快了将近 **30-40 倍**。在 CI/CD 中，这意味着更短的等待时间和更低的计算成本。

## 快速上手

安装非常简单：

```bash
npm install --save-dev @biomejs/biome
```

初始化配置：

```bash
npx biome init
```

这会生成一个 `biome.json` 文件：

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.0/schema.json",
  "organizeImports": {
    "enabled": true
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2
  }
}
```

在 `package.json` 中添加脚本：

```json
{
  "scripts": {
    "lint": "biome check src/",
    "format": "biome format --write src/"
  }
}
```

## 与现有工具对比

### vs ESLint

Biome 的 lint 规则覆盖了 ESLint 推荐规则的大部分。对于常规项目完全够用。如果你的项目依赖某些 ESLint 插件的特殊规则，可以通过 `@biomejs/eslint-plugin` 桥接使用。

### vs Prettier

Biome 的格式化输出与 Prettier 高度兼容。它支持相同的配置选项（缩进风格、引号、分号等），迁移成本极低。

## 编辑器集成

Biome 提供了 VS Code 和 JetBrains 系列 IDE 的官方插件。安装后，保存时自动格式化，体验与 Prettier 一致。

## 总结

如果你的项目不需要 ESLint 生态中那些复杂的插件，Biome 是一个非常好的替代方案。它更快、更简单、配置更少，而且还在快速迭代中。

工具链的简化不仅仅是少装几个包的问题——它降低了维护成本，减少了团队成员之间的配置争论，让大家都把精力集中在真正重要的事情上：**写好代码**。
