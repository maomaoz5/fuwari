<script>
import { onMount } from "svelte";

export let token;
export let slug = "";

let isNew = !slug;
let loading = isNew ? false : true;
let saving = false;
let error = "";
let success = "";

// Form fields
let newSlug = "";
let title = "";
let content = "";
let published = "";
let description = "";
let tagsStr = "";
let category = "";
let draft = false;

async function loadPost() {
	if (isNew) return;
	loading = true;
	error = "";
	try {
		const res = await fetch(`/api/admin/posts/${slug}/`, {
			headers: { Authorization: `Bearer ${token}` },
		});
		if (res.status === 401) {
			error = "认证已过期";
			return;
		}
		if (!res.ok) throw new Error("Failed to load post");
		const data = await res.json();
		title = data.title || "";
		content = data.content || "";
		published = data.published || "";
		description = data.description || "";
		tagsStr = (data.tags || []).join(", ");
		category = data.category || "";
		draft = data.draft || false;
	} catch (e) {
		error = "加载文章失败: " + e.message;
	} finally {
		loading = false;
	}
}

async function savePost() {
	saving = true;
	error = "";
	success = "";

	const tags = tagsStr
		.split(",")
		.map((t) => t.trim())
		.filter(Boolean);

	const frontmatter = {
		title,
		published: published || new Date().toISOString().slice(0, 10),
		description,
		tags,
		category,
		draft,
	};

	try {
		let res;
		if (isNew) {
			if (!newSlug.trim()) {
				error = "请输入文章 slug";
				saving = false;
				return;
			}
			res = await fetch("/api/admin/posts/", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					slug: newSlug.trim(),
					title,
					content,
					frontmatter,
				}),
			});
		} else {
			res = await fetch(`/api/admin/posts/${slug}`, {
				method: "PUT",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ content, frontmatter }),
			});
		}

		if (!res.ok) {
			const data = await res.json().catch(() => ({}));
			throw new Error(data.error || "保存失败");
		}

		success = "保存成功！";
		setTimeout(() => {
			navigate("#posts");
		}, 800);
	} catch (e) {
		error = "保存失败: " + e.message;
	} finally {
		saving = false;
	}
}

function navigate(hash) {
	window.dispatchEvent(new CustomEvent("admin-navigate", { detail: { hash } }));
}

function goBack() {
	navigate("#posts");
}

onMount(() => {
	loadPost();
});
</script>

<div>
  <div class="flex items-center justify-between mb-6">
    <h2 class="text-2xl font-bold text-gray-900 dark:text-white">
      {isNew ? '新建文章' : `编辑文章: ${slug}`}
    </h2>
    <button
      on:click={goBack}
      class="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
    >
      返回列表
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
  {:else}
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Left: Markdown editor -->
      <div class="lg:col-span-2">
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          {#if isNew}
            <div class="mb-4">
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                文章 Slug（URL 标识符，如 my-post）
              </label>
              <input
                type="text"
                bind:value={newSlug}
                class="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="my-new-post"
              />
            </div>
          {/if}

          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Markdown 内容
            </label>
            <textarea
              bind:value={content}
              rows="24"
              class="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm resize-y"
              placeholder="在这里输入 Markdown 内容..."
            ></textarea>
          </div>
        </div>
      </div>

      <!-- Right: Frontmatter form -->
      <div>
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-4">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">文章信息</h3>

          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">标题</label>
            <input
              type="text"
              bind:value={title}
              class="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="文章标题"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">发布日期</label>
            <input
              type="date"
              bind:value={published}
              class="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">描述</label>
            <textarea
              bind:value={description}
              rows="3"
              class="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="文章描述..."
            ></textarea>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">标签（逗号分隔）</label>
            <input
              type="text"
              bind:value={tagsStr}
              class="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="tag1, tag2, tag3"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">分类</label>
            <input
              type="text"
              bind:value={category}
              class="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="分类名称"
            />
          </div>

          <div class="flex items-center gap-2">
            <input
              type="checkbox"
              bind:checked={draft}
              id="draft-check"
              class="w-4 h-4 rounded border-gray-300 dark:border-gray-600"
            />
            <label for="draft-check" class="text-sm text-gray-700 dark:text-gray-300">草稿</label>
          </div>

          <div class="pt-4 flex gap-3">
            <button
              on:click={savePost}
              disabled={saving}
              class="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition font-medium disabled:opacity-50"
            >
              {saving ? '保存中...' : '保存'}
            </button>
            <button
              on:click={goBack}
              class="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
            >
              取消
            </button>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>
