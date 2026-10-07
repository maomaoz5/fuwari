<script lang="ts">
import { onMount } from "svelte";
import { api } from "../api";
import type { Route } from "../router";
import { navigate } from "../router";
import Admins from "./Admins.svelte";
import AiSummary from "./AiSummary.svelte";
import Config from "./Config.svelte";
import PostEditor from "./PostEditor.svelte";
import Posts from "./Posts.svelte";
import Stats from "./Stats.svelte";

let { route }: { route: Route } = $props();
let username = $state("");

const tabs = [
	{ name: "posts", label: "文章" },
	{ name: "admins", label: "管理员" },
	{ name: "config", label: "配置" },
	{ name: "stats", label: "统计" },
	{ name: "ai-summary", label: "AI 总结" },
];

onMount(async () => {
	try {
		const me = await api<{ username: string }>("/api/admin/me");
		username = me.username;
	} catch {
		/* 401 已由 api() 跳转登录 */
	}
	if (localStorage.getItem("theme") === "dark") {
		document.documentElement.classList.add("dark");
	}
});

function toggleTheme() {
	const el = document.documentElement;
	el.classList.toggle("dark");
	localStorage.setItem(
		"theme",
		el.classList.contains("dark") ? "dark" : "light",
	);
}

async function logout() {
	await api("/api/admin/logout", { method: "POST" }).catch(() => {});
	navigate("#/login");
	location.reload();
}
</script>

<div class="min-h-screen bg-gray-100 dark:bg-gray-900">
	<header class="bg-white dark:bg-gray-800 shadow">
		<div class="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
			<h1 class="text-lg font-bold text-gray-900 dark:text-white">博客管理面板</h1>
			<div class="flex items-center gap-3">
				<span class="text-sm text-gray-600 dark:text-gray-400">{username}</span>
				<button
					onclick={toggleTheme}
					class="px-3 py-1 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
				>主题</button>
				<button
					onclick={logout}
					class="px-3 py-1 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700"
				>退出</button>
			</div>
		</div>
		<nav class="max-w-7xl mx-auto px-4 flex gap-1">
			{#each tabs as tab (tab.name)}
				<button
					onclick={() => navigate(`#/${tab.name}`)}
					class="px-4 py-2 text-sm rounded-t-lg transition {route.name === tab.name
						? 'bg-gray-100 dark:bg-gray-900 text-blue-600 dark:text-blue-400 font-medium'
						: 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}"
				>{tab.label}</button>
			{/each}
		</nav>
	</header>

	<main class="max-w-7xl mx-auto px-4 py-6">
		{#if route.name === "posts" && route.params.slug}
			{#key route.params.slug}
				<PostEditor slug={route.params.slug === "new" ? null : route.params.slug} />
			{/key}
		{:else if route.name === "posts"}
			<Posts />
		{:else if route.name === "admins"}
			<Admins />
		{:else if route.name === "config"}
			<Config />
		{:else if route.name === "stats"}
			<Stats />
		{:else if route.name === "ai-summary"}
			<AiSummary />
		{/if}
	</main>
</div>
