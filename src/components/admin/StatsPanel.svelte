<script>
import { onMount } from "svelte";

export let token;

let stats = null;
let loading = true;
let error = "";
let range = "7d";

async function loadStats() {
	loading = true;
	error = "";
	try {
		const res = await fetch(`/api/admin/stats/?range=${range}`, {
			headers: { Authorization: `Bearer ${token}` },
		});
		if (res.status === 401) {
			error = "认证已过期";
			return;
		}
		if (!res.ok) throw new Error("Failed to load stats");
		stats = await res.json();
	} catch (e) {
		error = "加载统计数据失败: " + e.message;
	} finally {
		loading = false;
	}
}

function setRange(r) {
	range = r;
	loadStats();
}

$: maxDailyCount =
	stats && stats.dailyViews
		? Math.max(...stats.dailyViews.map((d) => d.count), 1)
		: 1;

onMount(() => {
	loadStats();
});
</script>

<div>
  <div class="flex items-center justify-between mb-6">
    <h2 class="text-2xl font-bold text-gray-900 dark:text-white">数据统计</h2>
    <div class="flex gap-2">
      <button
        on:click={() => setRange('7d')}
        class="px-3 py-1.5 text-sm rounded-lg transition {range === '7d'
          ? 'bg-blue-600 text-white'
          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}"
      >
        7 天
      </button>
      <button
        on:click={() => setRange('30d')}
        class="px-3 py-1.5 text-sm rounded-lg transition {range === '30d'
          ? 'bg-blue-600 text-white'
          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}"
      >
        30 天
      </button>
      <button
        on:click={() => setRange('all')}
        class="px-3 py-1.5 text-sm rounded-lg transition {range === 'all'
          ? 'bg-blue-600 text-white'
          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}"
      >
        全部
      </button>
    </div>
  </div>

  {#if error}
    <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
      <p class="text-red-600 dark:text-red-400 text-sm">{error}</p>
    </div>
  {/if}

  {#if loading}
    <div class="text-center py-12">
      <p class="text-gray-500 dark:text-gray-400">加载中...</p>
    </div>
  {:else if stats}
    <!-- Summary cards -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <p class="text-sm text-gray-500 dark:text-gray-400 mb-1">总页面访问量</p>
        <p class="text-3xl font-bold text-gray-900 dark:text-white">{stats.totalPageViews}</p>
      </div>
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <p class="text-sm text-gray-500 dark:text-gray-400 mb-1">总文章阅读量</p>
        <p class="text-3xl font-bold text-gray-900 dark:text-white">{stats.totalArticleViews}</p>
      </div>
    </div>

    <!-- Daily chart -->
    {#if stats.dailyViews && stats.dailyViews.length > 0}
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">每日访问量</h3>
        <div class="flex items-end gap-1 h-40">
          {#each stats.dailyViews as day}
            {@const height = (day.count / maxDailyCount) * 100}
            <div class="flex-1 flex flex-col items-center justify-end h-full" title="{day.date}: {day.count} 次">
              <span class="text-xs text-gray-500 dark:text-gray-400 mb-1">{day.count}</span>
              <div
                class="w-full bg-blue-500 dark:bg-blue-400 rounded-t transition-all"
                style="height: {Math.max(height, 2)}%"
              ></div>
              <span class="text-xs text-gray-400 dark:text-gray-500 mt-1 truncate w-full text-center" style="font-size: 10px">
                {day.date.slice(5)}
              </span>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Top articles -->
    {#if stats.topArticles && stats.topArticles.length > 0}
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">热门文章 Top 5</h3>
        <div class="space-y-3">
          {#each stats.topArticles.slice(0, 5) as article, i}
            <div class="flex items-center gap-3">
              <span class="w-6 h-6 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-sm font-medium text-gray-600 dark:text-gray-400">
                {i + 1}
              </span>
              <span class="flex-1 text-sm text-gray-900 dark:text-white truncate">{article.slug}</span>
              <span class="text-sm text-gray-500 dark:text-gray-400">{article.count} 次</span>
            </div>
          {/each}
        </div>
      </div>
    {:else}
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 text-center">
        <p class="text-gray-500 dark:text-gray-400">暂无文章访问数据</p>
      </div>
    {/if}
  {/if}
</div>
