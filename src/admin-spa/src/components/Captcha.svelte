<script lang="ts">
import { onMount, tick } from "svelte";
import { api } from "../api";

type CaptchaInfo = {
	enabled: boolean;
	provider: "turnstile" | "hcaptcha" | "none";
	siteKey: string;
};

let { onToken }: { onToken: (token: string) => void } = $props();
let container: HTMLDivElement | undefined = $state();
let info: CaptchaInfo | null = $state(null);
let failure = $state("");

const loadedScripts = new Set<string>();
function loadScript(src: string): Promise<void> {
	if (loadedScripts.has(src)) return Promise.resolve();
	return new Promise((resolve, reject) => {
		const el = document.createElement("script");
		el.src = src;
		el.async = true;
		el.onload = () => {
			loadedScripts.add(src);
			resolve();
		};
		el.onerror = () => reject(new Error(`Failed to load ${src}`));
		document.head.appendChild(el);
	});
}

onMount(async () => {
	try {
		info = await api<CaptchaInfo>("/api/admin/captcha-config");
	} catch {
		info = null;
		return;
	}
	if (!info.enabled || info.provider === "none") return;

	if (!info.siteKey) {
		failure = "Site Key 未配置，请在「站点配置」中填写";
		return;
	}

	// 关键：容器由 {#if info?.enabled} 控制，赋值后必须等 DOM 更新，
	// 否则 bind:this 还是 undefined，会导致验证框永远不渲染。
	await tick();
	if (!container) {
		failure = "验证码容器未就绪，请刷新页面";
		return;
	}

	const src =
		info.provider === "turnstile"
			? "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
			: "https://js.hcaptcha.com/1/api.js?render=explicit";

	try {
		await loadScript(src);
	} catch {
		failure = "验证码脚本加载失败，请检查网络或站点 CSP";
		return;
	}

	const widget = (window as unknown as Record<string, any>)[info.provider];
	if (!widget?.render) {
		failure = "验证码组件未初始化，请刷新页面";
		return;
	}

	widget.render(container, {
		sitekey: info.siteKey,
		theme: "auto",
		callback: (token: string) => {
			failure = "";
			onToken(token);
		},
		"expired-callback": () => onToken(""),
		"error-callback": () => {
			failure =
				"验证码加载失败：Site Key 可能未授权当前域名，请在 Cloudflare 后台检查 Hostname 配置";
			onToken("");
		},
	});
});
</script>

{#if info?.enabled}
	<div class="flex flex-col gap-2">
		<div bind:this={container}></div>
		{#if failure}
			<p class="text-sm text-red-500 dark:text-red-400">{failure}</p>
		{/if}
	</div>
{/if}
