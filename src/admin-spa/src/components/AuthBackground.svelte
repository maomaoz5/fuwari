<script lang="ts">
/**
 * 登录 / 重置密码页共用的背景层。
 *
 * 设计取舍：
 * - 底层永远是深色渐变。图床挂了、慢、被墙，都不会露出难看的纯灰底。
 * - 图片用 <img> 而非 CSS background-image：可以监听 onload 做淡入，
 *   加载失败也不影响表单，比 CSS 多背景更容易控制降级。
 * - 图上盖一层黑色遮罩，保证白卡片和小字在任意亮度的图片上都可读。
 * - 图源在带本站 Referer 的情况下实测过（均 200，无防盗链）。
 */
let { children } = $props();

const SOURCES = [
	"https://t.alcy.cc/pc", // 随机壁纸，实测 100KB~1.4MB，中位约 350KB
	"https://t.alcy.cc/moe", // 二次元向，量级相近
];

// 图床返回 302 指向固定图片，浏览器会缓存重定向结果——不加随机参数的话
// 刷新几次都是同一张，"随机"就是假的。加参数后每次真换图。
let src = $state(
	`${SOURCES[Math.floor(Math.random() * SOURCES.length)]}?r=${Math.random().toString(36).slice(2, 9)}`,
);
let loaded = $state(false);
let failed = $state(false);
</script>

<div
	class="relative min-h-screen flex items-center justify-center overflow-hidden px-4 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900"
>
	{#if !failed}
		<img
			src={src}
			alt=""
			aria-hidden="true"
			decoding="async"
			fetchpriority="low"
			class="pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity duration-700 {loaded
				? 'opacity-100'
				: 'opacity-0'}"
			onload={() => (loaded = true)}
			onerror={() => (failed = true)}
		/>
	{/if}

	<!-- 遮罩：压暗背景，保证卡片与输入框的对比度 -->
	<div class="pointer-events-none absolute inset-0 bg-black/55"></div>

	<div class="relative z-10 w-full max-w-sm">
		{@render children()}
	</div>
</div>
