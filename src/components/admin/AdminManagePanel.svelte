<script>
import { onMount } from "svelte";

let admins = [];
let loading = true;
let error = "";
let successMsg = "";

// 新建管理员表单
let showCreateForm = false;
let newUsername = "";
let newPassword = "";
let createError = "";

// 修改密码表单
let editingUsername = "";
let newPasswordInput = "";
let currentPasswordInput = "";
let changePwError = "";

// 设置邮箱表单
let editingEmailUsername = "";
let emailInput = "";
let emailError = "";

// 当前登录用户名（从 session 获取）
let currentUsername = "";

// 删除确认对话框
let deleteConfirmUsername = "";
let deleteConfirmPassword = "";
let showDeleteConfirm = false;
let deleting = false;

onMount(async () => {
	try {
		const res = await fetch("/api/admin/me");
		if (res.ok) {
			const data = await res.json();
			currentUsername = data.username;
		}
	} catch {
		// ignore
	}
	loadAdmins();
});

async function loadAdmins() {
	loading = true;
	error = "";
	try {
		const res = await fetch("/api/admin/admins/");
		if (res.status === 401) {
			error = "未授权，请重新登录";
			return;
		}
		if (res.ok) {
			admins = await res.json();
		} else {
			const data = await res.json().catch(() => null);
			error = data?.error || "加载管理员列表失败";
		}
	} catch {
		error = "网络错误";
	} finally {
		loading = false;
	}
}

async function handleCreate() {
	createError = "";
	if (!newUsername || !newPassword) {
		createError = "请填写用户名和密码";
		return;
	}
	if (newPassword.length < 12) {
		createError = "密码至少 12 个字符";
		return;
	}
	try {
		const res = await fetch("/api/admin/admins/", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ username: newUsername, password: newPassword }),
		});
		const data = await res.json().catch(() => null);
		if (res.ok) {
			successMsg = `管理员 "${newUsername}" 创建成功`;
			newUsername = "";
			newPassword = "";
			showCreateForm = false;
			loadAdmins();
			setTimeout(() => (successMsg = ""), 3000);
		} else {
			createError = data?.error || "创建失败";
		}
	} catch {
		createError = "网络错误";
	}
}

async function handleChangePassword() {
	changePwError = "";
	if (!currentPasswordInput) {
		changePwError = "请输入当前密码";
		return;
	}
	if (!newPasswordInput || newPasswordInput.length < 12) {
		changePwError = "密码至少 12 个字符";
		return;
	}
	try {
		const res = await fetch(`/api/admin/admins/${editingUsername}/`, {
			method: "PUT",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				newPassword: newPasswordInput,
				currentPassword: currentPasswordInput,
			}),
		});
		const data = await res.json().catch(() => null);
		if (res.ok) {
			successMsg = `"${editingUsername}" 密码已修改`;
			editingUsername = "";
			newPasswordInput = "";
			currentPasswordInput = "";
			setTimeout(() => (successMsg = ""), 3000);
		} else {
			changePwError = data?.error || "修改失败";
		}
	} catch {
		changePwError = "网络错误";
	}
}

async function handleUpdateEmail() {
	emailError = "";
	if (!emailInput) {
		emailError = "请输入邮箱地址";
		return;
	}
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	if (!emailRegex.test(emailInput.trim())) {
		emailError = "邮箱格式不正确";
		return;
	}
	try {
		const res = await fetch("/api/admin/update-email/", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			credentials: "include",
			body: JSON.stringify({ email: emailInput.trim() }),
		});
		const data = await res.json().catch(() => null);
		if (res.ok) {
			successMsg = `邮箱已更新为 "${emailInput.trim()}"`;
			editingEmailUsername = "";
			emailInput = "";
			loadAdmins();
			setTimeout(() => (successMsg = ""), 3000);
		} else {
			emailError = data?.error || "更新失败";
		}
	} catch {
		emailError = "网络错误";
	}
}

function handleDelete(username) {
	if (username === currentUsername) {
		error = "不能删除当前登录的管理员";
		setTimeout(() => (error = ""), 3000);
		return;
	}
	deleteConfirmUsername = username;
	deleteConfirmPassword = "";
	showDeleteConfirm = true;
}

async function confirmDelete() {
	if (!deleteConfirmPassword) {
		error = "请输入密码确认";
		return;
	}
	deleting = true;
	try {
		const res = await fetch(`/api/admin/admins/${deleteConfirmUsername}/`, {
			method: "DELETE",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ confirmPassword: deleteConfirmPassword }),
		});
		const data = await res.json().catch(() => null);
		if (res.ok) {
			successMsg = `管理员 "${deleteConfirmUsername}" 已删除`;
			loadAdmins();
			setTimeout(() => (successMsg = ""), 3000);
		} else {
			error = data?.error || "删除失败";
			setTimeout(() => (error = ""), 3000);
		}
	} catch {
		error = "网络错误";
		setTimeout(() => (error = ""), 3000);
	} finally {
		deleting = false;
		showDeleteConfirm = false;
		deleteConfirmUsername = "";
		deleteConfirmPassword = "";
	}
}
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <h2 class="text-xl font-bold text-gray-900 dark:text-white">管理员管理</h2>
    <button
      on:click={() => (showCreateForm = !showCreateForm)}
      class="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition text-sm font-medium"
    >
      {showCreateForm ? "取消" : "+ 新建管理员"}
    </button>
  </div>

  {#if successMsg}
    <div class="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 text-sm">
      {successMsg}
    </div>
  {/if}

  {#if error}
    <div class="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm">
      {error}
    </div>
  {/if}

  <!-- 新建管理员表单 -->
  {#if showCreateForm}
    <div class="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
      <h3 class="text-sm font-semibold text-gray-900 dark:text-white mb-3">新建管理员</h3>
      <div class="space-y-3">
        <div>
          <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">用户名</label>
          <input
            type="text"
            bind:value={newUsername}
            class="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            placeholder="输入用户名"
          />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">密码</label>
          <input
            type="password"
            bind:value={newPassword}
            on:keydown={(e) => e.key === 'Enter' && handleCreate()}
            class="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            placeholder="至少 12 个字符"
          />
        </div>
        {#if createError}
          <p class="text-red-500 text-xs">{createError}</p>
        {/if}
        <button
          on:click={handleCreate}
          class="px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 transition text-sm font-medium"
        >
          创建
        </button>
      </div>
    </div>
  {/if}

  <!-- 管理员列表 -->
  {#if loading}
    <div class="text-center py-8 text-gray-500 dark:text-gray-400">加载中...</div>
  {:else if admins.length === 0}
    <div class="text-center py-8 text-gray-500 dark:text-gray-400">暂无管理员</div>
  {:else}
    <div class="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-gray-50 dark:bg-gray-800">
          <tr>
            <th class="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">用户名</th>
            <th class="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">邮箱</th>
            <th class="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">创建时间</th>
            <th class="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">操作</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
          {#each admins as admin}
            <tr class="bg-white dark:bg-gray-800/30">
              <td class="px-4 py-3 text-gray-900 dark:text-white font-medium">
                {admin.username}
                {#if admin.username === currentUsername}
                  <span class="ml-2 text-xs text-blue-600 dark:text-blue-400">(当前)</span>
                {/if}
              </td>
              <td class="px-4 py-3 text-gray-500 dark:text-gray-400">
                {#if admin.email}
                  <span class="text-gray-700 dark:text-gray-300">{admin.email}</span>
                {:else}
                  <span class="text-gray-400 dark:text-gray-500 italic text-xs">未设置</span>
                {/if}
              </td>
              <td class="px-4 py-3 text-gray-500 dark:text-gray-400">{admin.createdAt}</td>
              <td class="px-4 py-3 text-right space-x-2">
                <button
                  on:click={() => {
                    editingEmailUsername = admin.username;
                    emailInput = admin.email || "";
                    emailError = "";
                  }}
                  class="text-green-600 dark:text-green-400 hover:underline text-xs"
                >
                  邮箱
                </button>
                <button
                  on:click={() => {
                    editingUsername = admin.username;
                    newPasswordInput = "";
                    currentPasswordInput = "";
                    changePwError = "";
                  }}
                  class="text-blue-600 dark:text-blue-400 hover:underline text-xs"
                >
                  改密
                </button>
                {#if admin.username !== currentUsername && admins.length > 1}
                  <button
                    on:click={() => handleDelete(admin.username)}
                    class="text-red-600 dark:text-red-400 hover:underline text-xs"
                  >
                    删除
                  </button>
                {/if}
              </td>
            </tr>
            {#if editingEmailUsername === admin.username}
              <tr class="bg-gray-50 dark:bg-gray-800/50">
                <td colspan="4" class="px-4 py-3">
                  <div class="space-y-2">
                    <div class="flex items-center gap-2">
                      <input
                        type="email"
                        bind:value={emailInput}
                        on:keydown={(e) => e.key === 'Enter' && handleUpdateEmail()}
                        class="flex-1 px-3 py-1.5 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                        placeholder="输入邮箱地址"
                      />
                      <button
                        on:click={handleUpdateEmail}
                        class="px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 transition text-xs"
                      >
                        保存
                      </button>
                      <button
                        on:click={() => { editingEmailUsername = ""; emailInput = ""; emailError = ""; }}
                        class="px-3 py-1.5 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition text-xs"
                      >
                        取消
                      </button>
                    </div>
                    {#if emailError}
                      <p class="text-red-500 text-xs mt-1">{emailError}</p>
                    {/if}
                  </div>
                </td>
              </tr>
            {/if}
            {#if editingUsername === admin.username}
              <tr class="bg-gray-50 dark:bg-gray-800/50">
                <td colspan="4" class="px-4 py-3">
                  <div class="space-y-2">
                    <div class="flex items-center gap-2">
                      <input
                        type="password"
                        bind:value={currentPasswordInput}
                        on:keydown={(e) => e.key === 'Enter' && handleChangePassword()}
                        class="flex-1 px-3 py-1.5 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                        placeholder="当前密码"
                      />
                    </div>
                    <div class="flex items-center gap-2">
                      <input
                        type="password"
                        bind:value={newPasswordInput}
                        on:keydown={(e) => e.key === 'Enter' && handleChangePassword()}
                        class="flex-1 px-3 py-1.5 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                        placeholder="新密码（至少 12 字符）"
                      />
                      <button
                        on:click={handleChangePassword}
                        class="px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 transition text-xs"
                      >
                        确认
                      </button>
                      <button
                        on:click={() => (editingUsername = "")}
                        class="px-3 py-1.5 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition text-xs"
                      >
                        取消
                      </button>
                    </div>
                    {#if changePwError}
                      <p class="text-red-500 text-xs mt-1">{changePwError}</p>
                    {/if}
                  </div>
                </td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  <!-- 删除确认对话框 -->
  {#if showDeleteConfirm}
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-sm">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">确认删除</h3>
        <p class="text-gray-600 dark:text-gray-400 text-sm mb-4">
          确定要删除管理员「{deleteConfirmUsername}」吗？请输入您的密码确认。
        </p>
        <div class="mb-4">
          <input
            type="password"
            bind:value={deleteConfirmPassword}
            on:keydown={(e) => e.key === 'Enter' && confirmDelete()}
            class="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            placeholder="输入密码确认"
          />
        </div>
        <div class="flex justify-end gap-3">
          <button
            on:click={() => { showDeleteConfirm = false; deleteConfirmUsername = ""; deleteConfirmPassword = ""; }}
            class="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
          >
            取消
          </button>
          <button
            on:click={confirmDelete}
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
