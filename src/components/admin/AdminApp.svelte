<script>
import { onDestroy, onMount } from "svelte";
import AdminManagePanel from "./AdminManagePanel.svelte";
import AiSummaryPanel from "./AiSummaryPanel.svelte";
import ConfigPanel from "./ConfigPanel.svelte";
import PostEditor from "./PostEditor.svelte";
import PostList from "./PostList.svelte";
import StatsPanel from "./StatsPanel.svelte";

let token = "";
let currentUsername = "";
let currentView = "posts";
let editorSlug = "";
let showLogin = false;
let loginUsername = "";
let loginPassword = "";
let loginError = "";
let mobileMenuOpen = false;

const navItems = [
	{ hash: "#posts", label: "文章管理", icon: "📄" },
	{ hash: "#config", label: "站点配置", icon: "⚙️" },
	{ hash: "#ai-summary", label: "AI 总结", icon: "🤖" },
	{ hash: "#stats", label: "数据统计", icon: "📊" },
	{ hash: "#admin-manage", label: "管理员", icon: "👤" },
];

function parseHash() {
	const hash = window.location.hash.slice(1) || "posts";
	applyHash(hash);
}

function applyHash(raw) {
	const [view, query] = raw.split("?");
	currentView = view || "posts";
	if (query) {
		const params = new URLSearchParams(query);
		editorSlug = params.get("slug") || "";
	} else {
		editorSlug = "";
	}
}

function navigateTo(hash) {
	const raw = hash.slice(1);
	applyHash(raw);
	window.location.hash = hash;
}

function handleHashChange() {
	parseHash();
}

function handleAdminNavigate(e) {
	navigateTo(e.detail.hash);
}

onMount(async () => {
	try {
		const res = await fetch("/api/admin/me");
		if (res.ok) {
			const data = await res.json();
			currentUsername = data.username;
			token = currentUsername;
			showLogin = false;
		} else {
			showLogin = true;
		}
	} catch {
		showLogin = true;
	}
	parseHash();
	window.addEventListener("hashchange", handleHashChange);
	window.addEventListener("admin-navigate", handleAdminNavigate);
});

onDestroy(() => {
	window.removeEventListener("hashchange", handleHashChange);
	window.removeEventListener("admin-navigate", handleAdminNavigate);
});

async function handleLogin() {
	loginError = "";
	try {
		const res = await fetch("/api/admin/auth/", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				username: loginUsername,
				password: loginPassword,
			}),
		});
		if (res.ok) {
			const data = await res.json();
			token = data.username || loginUsername;
			showLogin = false;
		} else {
			const errData = await res.json().catch(() => null);
			loginError = errData?.error || "用户名或密码错误";
		}
	} catch {
		loginError = "网络错误";
	}
}

function handleNavClick(hash) {
	const raw = hash.slice(1);
	applyHash(raw);
	window.location.hash = hash;
}

async function handleLogout() {
	try {
		await fetch("/api/admin/logout", { method: "POST" });
	} catch {
		// ignore
	}
	token = "";
	showLogin = true;
	loginUsername = "";
	loginPassword = "";
}

function isActive(hash) {
	const view = hash.slice(1);
	return currentView === view;
}
</script>

{#if showLogin}
  <div class="min-h-screen flex items-center justify-center">
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-8 w-full max-w-sm">
      <h1 class="text-2xl font-bold text-center text-gray-900 dark:text-white mb-6">管理面板</h1>
      <div class="mb-4">
        <label for="login-username" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          用户名
        </label>
        <input
          id="login-username"
          type="text"
          bind:value={loginUsername}
          class="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
          placeholder="请输入用户名"
        />
      </div>
      <div class="mb-4">
        <label for="login-password" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          密码
        </label>
        <input
          id="login-password"
          type="password"
          bind:value={loginPassword}
          on:keydown={(e) => e.key === 'Enter' && handleLogin()}
          class="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
          placeholder="请输入密码"
        />
      </div>
      {#if loginError}
        <p class="text-red-500 text-sm mb-4">{loginError}</p>
      {/if}
      <button
        on:click={handleLogin}
        class="w-full px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition font-medium"
      >
        登录
      </button>
      <div class="mt-3 text-center">
        <a href="/admin/reset-password/" class="text-sm opacity-60 hover:opacity-80 transition-opacity">忘记密码？</a>
      </div>
    </div>
  </div>
{:else}
  <div class="flex min-h-screen flex-col md:flex-row">
    <!-- 手机端顶部栏 -->
    <div class="md:hidden flex items-center justify-between px-3 py-2.5 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
      <button
        on:click={() => mobileMenuOpen = !mobileMenuOpen}
        class="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300"
      >
        ☰ 菜单
      </button>
      <span class="font-bold text-gray-900 dark:text-white">管理面板</span>
      <div class="w-16"></div>
    </div>

    <!-- 遮罩层 -->
    {#if mobileMenuOpen}
      <div
        class="md:hidden fixed inset-0 bg-black/50 z-40"
        on:click={() => mobileMenuOpen = false}
        on:keydown={(e) => e.key === 'Escape' && (mobileMenuOpen = false)}
        role="button"
        tabindex="-1"
        aria-label="关闭菜单"
      ></div>
    {/if}

    <!-- Sidebar -->
    <aside class="w-56 bg-gray-100 dark:bg-gray-800 flex flex-col shrink-0 border-r border-gray-200 dark:border-gray-700
      fixed md:relative z-50 h-full md:h-auto transition-transform duration-300 ease-in-out
      -translate-x-full md:translate-x-0" class:translate-x-0={mobileMenuOpen}>
      <div class="p-5 border-b border-gray-200 dark:border-gray-700">
        <h1 class="text-lg font-bold text-gray-900 dark:text-white">管理面板</h1>
      </div>

      <nav class="flex-1 p-3 space-y-1 overflow-y-auto">
        {#each navItems as item}
          <a
            href={item.hash}
            on:click={(e) => { e.preventDefault(); handleNavClick(item.hash); mobileMenuOpen = false; }}
            class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition {isActive(item.hash)
              ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}"
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </a>
        {/each}
      </nav>

      <div class="p-3 border-t border-gray-200 dark:border-gray-700">
        <a
          href="/"
          class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition mb-1"
        >
          <span>🌐</span>
          <span>返回博客</span>
        </a>
        <button
          on:click={handleLogout}
          class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
        >
          <span>🚪</span>
          <span>退出登录</span>
        </button>
      </div>
    </aside>

    <!-- Main content -->
    <main class="flex-1 overflow-auto">
      <div class="p-4 md:p-6">
        {#if token}
          {#if currentView === 'posts' || currentView === ''}
            <PostList />
          {:else if currentView === 'editor'}
            <PostEditor slug={editorSlug} />
          {:else if currentView === 'config'}
            <ConfigPanel />
          {:else if currentView === 'ai-summary'}
            <AiSummaryPanel />
          {:else if currentView === 'stats'}
            <StatsPanel />
          {:else if currentView === 'admin-manage'}
            <AdminManagePanel />
          {:else}
            <PostList />
          {/if}
        {/if}
      </div>
    </main>
  </div>
{/if}
