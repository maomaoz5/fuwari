<script>
import { onMount } from "svelte";

let summaries = [];
let loading = true;
let error = "";
let success = "";
let deletingSlug = "";

async function loadSummaries() {
	loading = true;
	error = "";
	try {
		const res = await fetch("/api/admin/ai-summary/");
		if (res.status === 401) {
			error = "认证已过期";
			return;
		}
		if (!res.ok) throw new Error("Failed to load summaries");
		summaries = await res.json();
	} catch (e) {
		error = `加载 AI 总结失败: ${e.message}`;
	} finally {
		loading = false;
	}
}

async function deleteSummary(slug) {
	deletingSlug = slug;
	error = "";
	try {
		const res = await fetch(`/api/admin/ai-summary/${slug}/`, {
			method: "DELETE",
		});
		if (!res.ok) throw new Error("Failed to delete");
		summaries = summaries.filter((s) => s.slug !== slug);
		success = `已删除 ${slug} 的缓存`;
		setTimeout(() => (success = ""), 3000);
	} catch (e) {
		error = `删除失败: ${e.message}`;
	} finally {
		deletingSlug = "";
	}
}

async function regenerate(slug) {
	error = "";
	try {
		const res = await fetch(`/api/admin/ai-summary/${slug}/`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
		});
		if (res.status === 501) {
			error = "重新生成功能暂未实现";
		} else {
			error = "操作失败";
		}
	} catch (e) {
		error = `请求失败: ${e.message}`;
	}
}

function formatSize(bytes) {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso) {
	if (!iso) return "-";
	const d = new Date(iso);
	return d.toLocaleString("zh-CN");
}

onMount(() => {
	loadSummaries();
});
</script>

<div>
  <div class="flex items-center justify-between mb-6">
    <h2 class="text-2xl font-bold text-gray-900 dark:text-white">AI 总结管理</h2>
    <button
      on:click={loadSummaries}
      class="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
    >
      刷新
    </button>
  </div>

  {#if error}
    <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
      <p class="text-red-600 dark:text-red-400 text-sm">{error}</p>
    </div>
  {/if}

  {#if success}
    <div class="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-4">
      <p class="text-green-600 dark:text-green-400 text-sm">{success}</p>
    </div>
  {/if}

  {#if loading}
    <div class="text-center py-12">
      <p class="text-gray-500 dark:text-gray-400">加载中...</p>
    </div>
  {:else if summaries.length === 0}
    <div class="text-center py-12 bg-white dark:bg-gray-800 rounded-lg shadow">
      <p class="text-gray-500 dark:text-gray-400">暂无 AI 总结缓存</p>
    </div>
  {:else}
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
      <table class="w-full">
        <thead class="bg-gray-50 dark:bg-gray-700">
          <tr>
            <th class="text-left px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300">文章 Slug</th>
            <th class="text-left px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300">文件大小</th>
            <th class="text-left px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300">最后修改时间</th>
            <th class="text-right px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300">操作</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
          {#each summaries as summary}
            <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
              <td class="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{summary.slug}</td>
              <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{formatSize(summary.size)}</td>
              <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{formatDate(summary.modifiedAt)}</td>
              <td class="px-4 py-3 text-right">
                <button
                  on:click={() => regenerate(summary.slug)}
                  class="px-3 py-1 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition mr-2"
                >
                  重新生成
                </button>
                <button
                  on:click={() => deleteSummary(summary.slug)}
                  disabled={deletingSlug === summary.slug}
                  class="px-3 py-1 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition disabled:opacity-50"
                >
                  {deletingSlug === summary.slug ? '删除中...' : '删除缓存'}
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
