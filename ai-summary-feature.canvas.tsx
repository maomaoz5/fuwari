import {
  Callout,
  Divider,
  Grid,
  H1,
  H2,
  Stack,
  Stat,
  Table,
  Text,
  Timeline,
} from "qoder/canvas";

export default function AiSummaryGoalReport() {

  return (
    <Stack gap={20}>
      <H1>AI 总结功能实现报告</H1>
      <Text tone="secondary">
        Fuwari 博客（Astro 7）— 构建时 AI 摘要生成 + 弹窗展示
      </Text>

      <Divider />

      <Grid columns={4} gap={12}>
        <Stat value="13" label="Spec 要求项" tone="success" />
        <Stat value="13" label="已通过验证" tone="success" />
        <Stat value="7" label="构建页面数" />
        <Stat value="0" label="类型错误" tone="success" />
      </Grid>

      <Divider />

      <H2>实施步骤</H2>
      <Timeline
        events={[
          {
            id: "1",
            title: "调研与规划",
            description:
              "3 个 Research Agent 并行探索代码库（简洁性/性能/最小变更视角），综合产出实施方案",
            status: "completed",
          },
          {
            id: "2",
            title: "配置层",
            description:
              "src/types/config.ts 新增 AiSummaryConfig 类型，src/config.ts 新增 aiSummaryConfig 导出",
            status: "completed",
          },
          {
            id: "3",
            title: "核心模块",
            description:
              "ai-summary.ts（OpenRouter API 调用 + 速率限制 + 重试）+ ai-summary-cache.ts（SHA-256 增量缓存）",
            status: "completed",
          },
          {
            id: "4",
            title: "Astro Integration",
            description:
              "src/integrations/ai-summary.ts 使用 astro:build:before 钩子，构建时自动生成摘要",
            status: "completed",
          },
          {
            id: "5",
            title: "Svelte 弹窗组件",
            description:
              "AiSummaryModal.svelte — float-panel 模式、fetch 懒加载、ESC/外部点击关闭、i18n 支持",
            status: "completed",
          },
          {
            id: "6",
            title: "页面集成",
            description:
              "[...slug].astro 条件渲染弹窗按钮，Layout.astro 注册点击外部关闭事件",
            status: "completed",
          },
          {
            id: "7",
            title: "国际化",
            description:
              "5 个翻译键 × 10 种语言文件全部同步更新",
            status: "completed",
          },
          {
            id: "8",
            title: "环境配置",
            description:
              ".env 配置 API Key，.env.example 示例文件，env.d.ts 类型声明，.gitignore 已更新",
            status: "completed",
          },
          {
            id: "9",
            title: "冲突修复",
            description:
              "多 Agent 交叉修改导致组件被误删、集成代码被移除，已重建并修复",
            status: "completed",
          },
          {
            id: "10",
            title: "最终验证",
            description:
              "pnpm check 0 错误，pnpm build 7 页面构建成功，dev 服务器运行正常",
            status: "completed",
          },
        ]}
      />

      <Divider />

      <H2>新增/修改文件清单</H2>
      <Table
        headers={["文件路径", "类型", "说明"]}
        rows={[
          ["src/types/config.ts", "修改", "新增 AiSummaryConfig 类型定义"],
          ["src/config.ts", "修改", "新增 aiSummaryConfig 导出（enable/model/maxTokens）"],
          ["src/utils/ai-summary.ts", "新增", "OpenRouter API 调用封装，含速率控制和重试"],
          ["src/utils/ai-summary-cache.ts", "新增", "SHA-256 内容哈希增量缓存管理"],
          ["src/integrations/ai-summary.ts", "新增", "Astro Integration，astro:build:before 钩子"],
          ["astro.config.mjs", "修改", "导入并注册 aiSummary Integration"],
          ["src/components/AiSummaryModal.svelte", "新增", "Svelte 弹窗组件，fetch 懒加载"],
          ["src/pages/posts/[...slug].astro", "修改", "条件渲染 AI 总结按钮和弹窗"],
          ["src/layouts/Layout.astro", "修改", "注册弹窗点击外部关闭事件"],
          ["src/i18n/i18nKey.ts", "修改", "新增 5 个 AI 总结相关枚举值"],
          ["src/i18n/languages/*.ts (×10)", "修改", "所有语言文件添加翻译"],
          [".env", "新增", "OPENROUTER_API_KEY 配置"],
          [".env.example", "新增", "API Key 示例文件"],
          ["src/env.d.ts", "修改", "环境变量类型声明"],
        ]}
        density="compact"
      />

      <Divider />

      <H2>架构决策</H2>
      <Table
        headers={["决策", "选择", "理由"]}
        rows={[
          ["构建集成方式", "Astro Integration 钩子", "比独立脚本更优雅，无需修改 build 命令"],
          ["缓存策略", "per-file JSON（public/ai-summaries/）", "Astro 自动复制到 dist/，客户端按需 fetch"],
          ["API Key 配置", "环境变量 OPENROUTER_API_KEY", "构建时使用，兼容所有部署环境"],
          ["数据加载", "客户端 fetch 静态 JSON", "弹窗按需交互，不增加页面初始体积"],
          ["组件技术", "Svelte 弹窗", "复用项目已有 float-panel 模式"],
        ]}
        density="compact"
      />

      <Divider />

      <H2>风险与缓解</H2>
      <Grid columns={2} gap={12}>
        <Callout tone="warning" title="OpenRouter 免费额度（50次/天）">
          <Text size="small">
            SHA-256 增量缓存确保仅新/修改文章调用 API，首次构建后后续构建通常无需调用
          </Text>
        </Callout>
        <Callout tone="warning" title="速率限制 20 RPM">
          <Text size="small">
            串行调用 + 3s 间隔 + 指数退避重试（30s/60s/120s），失败不阻塞构建
          </Text>
        </Callout>
      </Grid>

      <Divider />

      <H2>最终状态</H2>
      <Grid columns={3} gap={12}>
        <Stat value="13/13" label="Spec 要求通过" tone="success" />
        <Stat value="0" label="TypeScript 错误" tone="success" />
        <Stat value="7" label="页面构建成功" tone="success" />
      </Grid>

      <Text tone="secondary" size="small">
        功能已启用（enable: true），API Key 已配置，dev 服务器运行于 localhost:3000
      </Text>
    </Stack>
  );
}
