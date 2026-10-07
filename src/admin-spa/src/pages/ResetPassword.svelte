<script lang="ts">
	import Captcha from "../components/Captcha.svelte";
	import { api, ApiError } from "../api";
	import { navigate } from "../router";

	let { query }: { query: URLSearchParams } = $props();
	const token = query.get("token") ?? "";

	let newPassword = $state("");
	let username = $state("");
	let captchaToken = $state("");
	let error = $state("");
	let success = $state("");
	let busy = $state(false);
	let captchaKey = $state(0);

	async function reset(e: SubmitEvent) {
		e.preventDefault();
		error = "";
		success = "";
		busy = true;
		try {
			const res = await api<{ message: string }>("/api/admin/auth/reset-password", {
				method: "POST",
				body: JSON.stringify({ token, newPassword }),
			});
			success = res.message;
			setTimeout(() => navigate("#/login"), 1500);
		} catch (err) {
			error = err instanceof ApiError ? err.message : "网络错误";
		} finally {
			busy = false;
		}
	}

	async function request(e: SubmitEvent) {
		e.preventDefault();
		error = "";
		success = "";
		busy = true;
		try {
			const res = await api<{ message: string }>("/api/admin/auth/forgot-password", {
				method: "POST",
				body: JSON.stringify({
					username,
					captchaToken: captchaToken || undefined,
				}),
			});
			success = res.message;
		} catch (err) {
			if (err instanceof ApiError) {
				error = err.message;
				if (err.code === "captcha_failed") {
					captchaToken = "";
					captchaKey++;
				}
			} else {
				error = "网络错误";
			}
		} finally {
			busy = false;
		}
	}
</script>

<div class="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 px-4">
	<form
		onsubmit={token ? reset : request}
		class="w-full max-w-sm bg-white dark:bg-gray-800 rounded-lg shadow p-8 space-y-4"
	>
		<h1 class="text-2xl font-bold text-gray-900 dark:text-white text-center">
			{token ? "重置密码" : "找回密码"}
		</h1>

		{#if error}
			<div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
				<p class="text-red-600 dark:text-red-400 text-sm">{error}</p>
			</div>
		{/if}
		{#if success}
			<div class="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
				<p class="text-green-600 dark:text-green-400 text-sm">{success}</p>
			</div>
		{/if}

		{#if token}
			<input
				type="password"
				bind:value={newPassword}
				placeholder="新密码（至少 12 个字符）"
				autocomplete="new-password"
				class="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
			/>
		{:else}
			<input
				type="text"
				bind:value={username}
				placeholder="用户名"
				class="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
			/>
			{#key captchaKey}
				<Captcha onToken={(t) => (captchaToken = t)} />
			{/key}
		{/if}

		<button
			type="submit"
			disabled={busy}
			class="w-full px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition font-medium disabled:opacity-50"
		>
			{busy ? "提交中..." : token ? "重置密码" : "发送重置邮件"}
		</button>

		<p class="text-center">
			<a href="#/login" class="text-sm text-blue-600 dark:text-blue-400 hover:underline"
				>返回登录</a
			>
		</p>
	</form>
</div>
