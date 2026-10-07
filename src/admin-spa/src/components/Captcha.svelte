<script lang="ts">
	import { onMount } from "svelte";
	import { api } from "../api";

	type CaptchaInfo = {
		enabled: boolean;
		provider: "turnstile" | "hcaptcha" | "none";
		siteKey: string;
	};

	let { onToken }: { onToken: (token: string) => void } = $props();
	let container: HTMLDivElement | undefined = $state();
	let info: CaptchaInfo | null = $state(null);

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
		if (!info.enabled || info.provider === "none" || !container) return;
		const src =
			info.provider === "turnstile"
				? "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
				: "https://js.hcaptcha.com/1/api.js?render=explicit";
		await loadScript(src);
		const w = (window as unknown as Record<string, any>)[info.provider];
		w?.render?.(container, {
			sitekey: info.siteKey,
			callback: (token: string) => onToken(token),
			"expired-callback": () => onToken(""),
		});
	});
</script>

{#if info?.enabled}
	<div bind:this={container}></div>
{/if}
