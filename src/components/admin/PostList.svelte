<script>
import { onMount } from "svelte";

let posts = [];
let loading = true;
let error = "";
let deleteTarget = null;
let deleting = false;
let mounted = false;

async function loadPosts() {
	loading = true;
	error = "";
	try {
		const res = await fetch("/api/admin/posts/");
		if (res.status === 401) {
			error = "认证已过期，请重新登录";
			return;
		}
		if (!res.ok) throw new Error("Failed to load posts");
		posts = await res.json();
	} catch (e) {
		error = `加载文章失败: ${e.message}`;
	} finally {
		loading = false;
	}
}

function navigate(hash) {
	window.dispatchEvent(new CustomEvent("admin-navigate", { detail: { hash } }));
}

function editPost(slug) {
	navigate(`#editor?slug=${slug}`);
}

function newPost() {
	navigate("#editor");
}

function confirmDelete(post) {
	deleteTarget = post;
}

function cancelDelete() {
	deleteTarget = null;
}

async function doDelete() {
	if (!deleteTarget) return;
	deleting = true;
	try {
		const res = await fetch(`/api/admin/posts/${deleteTarget.slug}/`, {
			method: "DELETE",
		});
		if (!res.ok) throw new Error("Failed to delete");
		posts = posts.filter((p) => p.slug !== deleteTarget.slug);
		deleteTarget = null;
	} catch (e) {
		error = `删除失败: ${e.message}`;
	} finally {
		deleting = false;
	}
}

onMount(() => {
	mounted = true;
});

// 当组件已挂载时加载文章
$: if (mounted) loadPosts();
</script>

<div>
  <div class="flex items-center justify-between mb-6">
    <h2 class="text-2xl font-bold text-gray-900 dark:text-white">文章管理</h2>
    <button
      on:click={newPost}
      class="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition font-medium"
    >
      + 新建文章
    </button>
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
  {:else if posts.length === 0}
    <div class="text-center py-12 bg-white dark:bg-gray-800 rounded-lg shadow">
      <p class="text-gray-500 dark:text-gray-400 mb-4">暂无文章</p>
      <button
        on:click={newPost}
        class="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition"
      >
        创建第一篇文章
      </button>
    </div>
  {:else}
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
      <table class="w-full">
        <thead class="bg-gray-50 dark:bg-gray-700">
          <tr>
            <th class="text-left px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300">标题</th>
            <th class="text-left px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300">分类</th>
            <th class="text-left px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300">标签</th>
            <th class="text-left px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300">状态</th>
            <th class="text-left px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300">发布日期</th>
            <th class="text-right px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300">操作</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
          {#each posts as post}
            <tr class="hover:bg-gray-50 dark:hover:bg-gray-750 transition">
              <td class="px-4 py-3">
                <span class="text-sm font-medium text-gray-900 dark:text-white">{post.title}</span>
                <span class="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">{post.slug}</span>
              </td>
              <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{post.category || '-'}</td>
              <td class="px-4 py-3">
                <div class="flex flex-wrap gap-1">
                  {#if post.tags && post.tags.length > 0}
                    {#each post.tags as tag}
                      <span class="inline-block px-2 py-0.5 text-xs rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">{tag}</span>
                    {/each}
                  {:else}
                    <span class="text-sm text-gray-400">-</span>
                  {/if}
                </div>
              </td>
              <td class="px-4 py-3">
                {#if post.draft}
                  <span class="inline-block px-2 py-0.5 text-xs rounded-full bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400">草稿</span>
                {:else}
                  <span class="inline-block px-2 py-0.5 text-xs rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">已发布</span>
                {/if}
              </td>
              <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{post.published || '-'}</td>
              <td class="px-4 py-3 text-right">
                <button
                  on:click={() => editPost(post.slug)}
                  class="px-3 py-1 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition mr-2"
                >
                  编辑
                </button>
                <button
                  on:click={() => confirmDelete(post)}
                  class="px-3 py-1 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition"
                >
                  删除
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  <!-- Delete confirmation modal -->
  {#if deleteTarget}
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-sm">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">确认删除</h3>
        <p class="text-gray-600 dark:text-gray-400 text-sm mb-6">
          确定要删除文章「{deleteTarget.title}」吗？此操作不可撤销。
        </p>
        <div class="flex justify-end gap-3">
          <button
            on:click={cancelDelete}
            class="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
          >
            取消
          </button>
          <button
            on:click={doDelete}
            disabled={deleting}
            class="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-50"
          >
            {deleting ? '删除中...' : '确认删除'}
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>
