<script>
import { onMount } from "svelte";
import { ApiError, api } from "../api";

let admins = [];
let loading = true;
let error = "";
let successMsg = "";
let currentUsername = "";

let showCreateForm = false;
let newUsername = "";
let newPassword = "";
let createError = "";

let editingUsername = "";
let newPasswordInput = "";
let currentPasswordInput = "";
let changePwError = "";

let editingEmailUsername = "";
let emailInput = "";
let emailError = "";

let deleteConfirmUsername = "";
let deleteConfirmPassword = "";
let showDeleteConfirm = false;
let deleting = false;

onMount(async () => {
	try {
		const me = await api("/api/admin/me");
		currentUsername = me.username;
	} catch {
		/* ignore */
	}
	loadAdmins();
});

async function loadAdmins() {
	loading = true;
	error = "";
	try {
		admins = await api("/api/admin/admins");
	} catch (e) {
		error = e instanceof ApiError ? e.message : "加载管理员列表失败";
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
		await api("/api/admin/admins", {
			method: "POST",
			body: JSON.stringify({ username: newUsername, password: newPassword }),
		});
		successMsg = `管理员 "${newUsername}" 创建成功`;
		newUsername = "";
		newPassword = "";
		showCreateForm = false;
		loadAdmins();
		setTimeout(() => (successMsg = ""), 3000);
	} catch (e) {
		createError = e instanceof ApiError ? e.message : "创建失败";
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
		await api(`/api/admin/admins/${editingUsername}`, {
			method: "PUT",
			body: JSON.stringify({
				newPassword: newPasswordInput,
				currentPassword: currentPasswordInput,
			}),
		});
		successMsg = `"${editingUsername}" 密码已修改`;
		editingUsername = "";
		newPasswordInput = "";
		currentPasswordInput = "";
		setTimeout(() => (successMsg = ""), 3000);
	} catch (e) {
		changePwError = e instanceof ApiError ? e.message : "修改失败";
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
		await api("/api/admin/update-email", {
			method: "POST",
			body: JSON.stringify({ email: emailInput.trim() }),
		});
		successMsg = `邮箱已更新为 "${emailInput.trim()}"`;
		editingEmailUsername = "";
		emailInput = "";
		loadAdmins();
		setTimeout(() => (successMsg = ""), 3000);
	} catch (e) {
		emailError = e instanceof ApiError ? e.message : "更新失败";
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
		await api(`/api/admin/admins/${deleteConfirmUsername}`, {
			method: "DELETE",
			body: JSON.stringify({ confirmPassword: deleteConfirmPassword }),
		});
		successMsg = `管理员 "${deleteConfirmUsername}" 已删除`;
		loadAdmins();
		setTimeout(() => (successMsg = ""), 3000);
	} catch (e) {
		error = e instanceof ApiError ? e.message : "删除失败";
		setTimeout(() => (error = ""), 3000);
	} finally {
		deleting = false;
		showDeleteConfirm = false;
	}
}
</script>

<div>
  <div class="flex items-center justify-between mb-6">
    <h2 class="text-2xl font-bold text-gray-900 dark:text-white">管理员管理</h2>
    <button
      onclick={() => (showCreateForm = !showCreateForm)}
      class="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition font-medium"
    >
      {showCreateForm ? '取消' : '+ 新建管理员'}
    </button>
  </div>

  {#if error}
    <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
      <p class="text-red-600 dark:text-red-400 text-sm">{error}</p>
    </div>
  {/if}

  {#if successMsg}
    <div class="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-4">
      <p class="text-green-600 dark:text-green-400 text-sm">{successMsg}</p>
    </div>
  {/if}

  {#if showCreateForm}
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
      <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">新建管理员</h3>
      {#if createError}
        <p class="text-red-600 dark:text-red-400 text-sm mb-3">{createError}</p>
      {/if}
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <input
          type="text"
          bind:value={newUsername}
          placeholder="用户名"
          class="px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
        />
        <input
          type="password"
          bind:value={newPassword}
          placeholder="密码（至少 12 个字符）"
          class="px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
        />
      </div>
      <button
        onclick={handleCreate}
        class="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition"
      >
        创建
      </button>
    </div>
  {/if}

  {#if loading}
    <div class="text-center py-12">
      <p class="text-gray-500 dark:text-gray-400">加载中...</p>
    </div>
  {:else}
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
      <table class="w-full">
        <thead class="bg-gray-50 dark:bg-gray-700">
          <tr>
            <th class="text-left px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300">用户名</th>
            <th class="text-left px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300">邮箱</th>
            <th class="text-left px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300">创建时间</th>
            <th class="text-right px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300">操作</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
          {#each admins as admin}
            <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
              <td class="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                {admin.username}
                {#if admin.username === currentUsername}
                  <span class="ml-2 px-2 py-0.5 text-xs rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">当前</span>
                {/if}
              </td>
              <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{admin.email || '-'}</td>
              <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{admin.createdAt}</td>
              <td class="px-4 py-3 text-right">
                <button
                  onclick={() => { editingUsername = admin.username; changePwError = ''; }}
                  class="px-3 py-1 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition mr-2"
                >
                  修改密码
                </button>
                <button
                  onclick={() => { editingEmailUsername = admin.username; emailInput = admin.email || ''; emailError = ''; }}
                  class="px-3 py-1 text-sm text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded transition mr-2"
                >
                  设置邮箱
                </button>
                <button
                  onclick={() => handleDelete(admin.username)}
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

  {#if editingUsername}
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-sm">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">修改密码: {editingUsername}</h3>
        {#if changePwError}
          <p class="text-red-600 dark:text-red-400 text-sm mb-3">{changePwError}</p>
        {/if}
        <div class="space-y-3 mb-4">
          <input
            type="password"
            bind:value={currentPasswordInput}
            placeholder="该账号的当前密码"
            class="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
          <input
            type="password"
            bind:value={newPasswordInput}
            placeholder="新密码（至少 12 个字符）"
            class="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
        </div>
        <div class="flex justify-end gap-3">
          <button
            onclick={() => (editingUsername = '')}
            class="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
          >
            取消
          </button>
          <button
            onclick={handleChangePassword}
            class="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition"
          >
            确认修改
          </button>
        </div>
      </div>
    </div>
  {/if}

  {#if editingEmailUsername}
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-sm">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">设置邮箱（当前登录账号）</h3>
        {#if emailError}
          <p class="text-red-600 dark:text-red-400 text-sm mb-3">{emailError}</p>
        {/if}
        <input
          type="email"
          bind:value={emailInput}
          placeholder="邮箱地址"
          class="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white mb-4"
        />
        <div class="flex justify-end gap-3">
          <button
            onclick={() => (editingEmailUsername = '')}
            class="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
          >
            取消
          </button>
          <button
            onclick={handleUpdateEmail}
            class="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  {/if}

  {#if showDeleteConfirm}
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-sm">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">删除管理员</h3>
        <p class="text-gray-600 dark:text-gray-400 text-sm mb-4">
          确定要删除管理员「{deleteConfirmUsername}」吗？需要输入你的密码确认。
        </p>
        <input
          type="password"
          bind:value={deleteConfirmPassword}
          placeholder="你的登录密码"
          class="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white mb-4"
        />
        <div class="flex justify-end gap-3">
          <button
            onclick={() => (showDeleteConfirm = false)}
            class="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
          >
            取消
          </button>
          <button
            onclick={confirmDelete}
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
