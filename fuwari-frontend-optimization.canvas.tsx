import {
  Callout,
  Divider,
  Grid,
  H1,
  H2,
  Row,
  Stack,
  Stat,
  Table,
  Tag,
  Text,
} from "qoder/canvas";

const taskData = [
  { task: "Task 1", title: "Layout.astro 优化", items: 5 },
  { task: "Task 2", title: "配置 + 样式 + 清理", items: 7 },
  { task: "Task 3", title: "组件优化", items: 5 },
  { task: "Task 4", title: "SEO 结构化数据", items: 3 },
];

const optimizationItems = [
  ["1", "viewport meta 补全 initial-scale=1", "性能", "Layout.astro"],
  ["2", "添加 canonical URL", "SEO", "Layout.astro"],
  ["3", "添加 og:image / twitter:image", "SEO", "Layout.astro"],
  ["4", "清理 ~50 行注释死代码", "代码", "Layout.astro"],
  ["5", "滚动/resize 事件 rAF 节流", "性能", "Layout.astro"],
  ["6", "Expressive Code 主题去重", "性能", "astro.config.mjs"],
  ["7", "移除未使用 npm 依赖", "代码", "package.json"],
  ["8", "全局 transition 收窄至 html 级别", "性能", "main.css"],
  ["9", "添加 prefers-reduced-motion", "可访问性", "transition.css"],
  ["10", "放开 /_astro/ 资源目录", "SEO", "robots.txt.ts"],
  ["11", "删除空文件 GlobalStyles.astro", "代码", "—"],
  ["12", "删除空占位 markdown.css", "代码", "—"],
  ["13", "远程图片 lazy + async decoding", "性能", "ImageWrapper.astro"],
  ["14", "修复重复 top-4 class", "代码", "SideBar.astro"],
  ["15", "Search focus 可访问性修复", "可访问性", "Search.svelte"],
  ["16", "Footer 外部链接 rel 统一", "安全", "Footer.astro"],
  ["17", "Navbar 外部链接 rel 统一", "安全", "Navbar.astro"],
  ["18", "JSON-LD 补全 image/dateModified/url", "SEO", "[...slug].astro"],
  ["19", "图片 alt 文本改进", "SEO", "MainGrid/PostCard"],
  ["20", "License 链接 rel 安全属性", "安全", "License.astro"],
];

function toneForCategory(cat: string) {
  switch (cat) {
    case "性能": return "info" as const;
    case "SEO": return "success" as const;
    case "代码": return "neutral" as const;
    case "可访问性": return "warning" as const;
    case "安全": return "danger" as const;
    default: return "neutral" as const;
  }
}

export default function FuwariOptimizationReport() {
  return (
    <Stack gap={20}>
      <H1>Fuwari 前端全面优化报告</H1>

      <Callout tone="success">
        <Text>
          全部 <strong>20 项</strong>优化已实现并通过构建验证，代码审计逐项确认。
        </Text>
      </Callout>

      <Grid columns={4} gap={12}>
        <Stat value="20" label="优化项总数" tone="success" />
        <Stat value="4" label="并行任务" />
        <Stat value="15+" label="涉及文件" />
        <Stat value="0" label="构建错误" tone="success" />
      </Grid>

      <Divider />

      <H2>任务概览</H2>
      <Grid columns={4} gap={12}>
        {taskData.map((t) => (
          <Stack key={t.task} gap={4}>
            <Text tone="secondary" size="small">{t.task}</Text>
            <Text weight="semibold">{t.title}</Text>
            <Row gap={6}>
              <Tag tone="success">{t.items} 项</Tag>
              <Tag tone="success">已完成</Tag>
            </Row>
          </Stack>
        ))}
      </Grid>

      <Divider />

      <H2>优化明细</H2>
      <Table
        columns={[
          { header: "#", key: "id", width: "40px" },
          { header: "优化项", key: "item" },
          { header: "类别", key: "category" },
          { header: "文件", key: "file" },
          { header: "状态", key: "status" },
        ]}
        rows={optimizationItems.map((row) => ({
          id: row[0],
          item: row[1],
          category: <Tag tone={toneForCategory(row[2])}>{row[2]}</Tag>,
          file: <Text size="small">{row[3]}</Text>,
          status: <Tag tone="success">已实现</Tag>,
        }))}
        density="compact"
      />

      <Divider />

      <H2>构建验证</H2>
      <Grid columns={3} gap={12}>
        <Stat value="7" label="页面生成" />
        <Stat value="544" label="Pagefind 索引词" />
        <Stat value="6.79s" label="构建耗时" />
      </Grid>

      <Callout tone="info">
        <Text size="small">
          已排除项：KaTeX CSS 按需加载（回归风险中）、PhotoSwipe 延迟加载（逻辑复杂）、
          OverlayScrollbars 异步初始化（样式闪烁风险）、字体预加载改造（收益有限）、图标库统一（改动面大）。
        </Text>
      </Callout>
    </Stack>
  );
}
