<script lang="ts">
import { ApiError, api } from "../api";
import Captcha from "../components/Captcha.svelte";
import { navigate } from "../router";

let { onLogin }: { onLogin?: () => void } = $props();

let username = $state("");
let password = $state("");
let token = $state("");
let error = $state("");
let busy = $state(false);
let captchaKey = $state(0);

async function submit(e: SubmitEvent) {
	e.preventDefault();
	error = "";
	busy = true;
	try {
		await api("/api/admin/auth", {
			method: "POST",
			body: JSON.stringify({
				username,
				password,
				captchaToken: token || undefined,
			}),
		});
		onLogin?.();
		navigate("#/posts");
	} catch (err) {
		if (err instanceof ApiError) {
			error = err.message;
			if (err.code === "captcha_failed") {
				token = "";
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
		onsubmit={submit}
		class="w-full max-w-sm bg-white dark:bg-gray-800 rounded-lg shadow p-8 space-y-4"
	>
		<h1 class="text-2xl font-bold text-gray-900 dark:text-white text-center">管理登录</h1>

		{#if error}
			<div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
				<p class="text-red-600 dark:text-red-400 text-sm">{error}</p>
			</div>
		{/if}

		<input
			type="text"
			bind:value={username}
			placeholder="用户名"
			autocomplete="username"
			class="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
		/>
		<input
			type="password"
			bind:value={password}
			placeholder="密码"
			autocomplete="current-password"
			class="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
		/>

		{#key captchaKey}
			<Captcha onToken={(t) => (token = t)} />
		{/key}

		<button
			type="submit"
			disabled={busy}
			class="w-full px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition font-medium disabled:opacity-50"
		>
			{busy ? "登录中..." : "登录"}
		</button>

		<p class="text-center">
			<a
				href="#/reset-password"
				class="text-sm text-blue-600 dark:text-blue-400 hover:underline"
			>忘记密码?</a
			>
		</p>
	</form>
</div>
