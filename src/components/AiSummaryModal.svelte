<script lang="ts">
import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import Icon from "@iconify/svelte";
import { slide } from "svelte/transition";
import { onDestroy } from "svelte";

export let slug: string;

let expanded = false;
let loading = false;
let error = false;
let summary = "";
let displayedText = "";
let isTyping = false;
let hasFullyDisplayed = false;
let typingInterval: ReturnType<typeof setInterval>;

const toggle = () => {
	expanded = !expanded;
	if (expanded && !summary && !loading) {
		fetchSummary();
	}
};

const startTyping = (text: string) => {
	displayedText = "";
	isTyping = true;
	hasFullyDisplayed = false;
	let index = 0;
	typingInterval = setInterval(() => {
		const chunkSize = Math.floor(Math.random() * 2) + 2;
		index += chunkSize;
		if (index >= text.length) {
			displayedText = text;
			isTyping = false;
			hasFullyDisplayed = true;
			clearInterval(typingInterval);
		} else {
			displayedText = text.slice(0, index);
		}
	}, 25);
};

const fetchSummary = async () => {
	loading = true;
	error = false;
	try {
		const res = await fetch(`/ai-summaries/${slug}.json`);
		if (!res.ok) throw new Error("Failed to fetch");
		const data = await res.json();
		summary = data.summary ?? data.content ?? "";
		startTyping(summary);
	} catch (e) {
		console.error("AI summary fetch error:", e);
		error = true;
	} finally {
		loading = false;
	}
};

onDestroy(() => {
	if (typingInterval) clearInterval(typingInterval);
});
</script>

<div class="ai-summary-inline onload-animation">
	<button
		class="ai-summary-toggle"
		on:click={toggle}
		aria-expanded={expanded}
		aria-label={i18n(I18nKey.aiSummary)}
	>
		<Icon icon="material-symbols:auto-awesome-outline" class="text-[1.125rem]" />
		<span class="text-sm font-medium">{i18n(I18nKey.aiSummary)}</span>
		<Icon
			icon="material-symbols:keyboard-arrow-down-rounded"
			class="text-[1.125rem] transition-transform duration-200 {expanded ? 'rotate-180' : ''}"
		/>
	</button>

	{#if expanded}
		<div class="ai-summary-content card-base rounded-xl p-4 mt-2" transition:slide={{ duration: 200 }}>
			{#if loading}
				<div class="text-sm text-black/50 dark:text-white/50 flex items-center gap-2">
					<Icon icon="material-symbols:hourglass-empty" class="text-[1.125rem] animate-pulse" />
					{i18n(I18nKey.aiSummaryLoading)}
				</div>
			{:else if error}
				<div class="text-sm text-red-500 flex items-center gap-2">
					<Icon icon="material-symbols:error-outline-rounded" class="text-[1.125rem]" />
					{i18n(I18nKey.aiSummaryError)}
				</div>
			{:else if summary}
				<div class="text-sm text-black/70 dark:text-white/70 leading-relaxed">
					{hasFullyDisplayed ? summary : displayedText}{#if isTyping}<span class="typing-cursor">▊</span>{/if}
				</div>
				<div class="text-xs text-black/30 dark:text-white/30 mt-3 pt-2 border-t border-black/10 dark:border-white/10 flex items-center gap-1">
					<Icon icon="material-symbols:auto-awesome-outline" class="text-[0.875rem]" />
					{i18n(I18nKey.aiSummaryGeneratedBy)}
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.ai-summary-inline {
		margin-bottom: 1rem;
	}
	.ai-summary-toggle {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.375rem 0.875rem;
		border-radius: 0.75rem;
		font-size: 0.875rem;
		color: var(--primary);
		background: color-mix(in srgb, var(--primary) 8%, transparent);
		border: 1px solid color-mix(in srgb, var(--primary) 20%, transparent);
		cursor: pointer;
		transition: all 0.2s ease;
	}
	.ai-summary-toggle:hover {
		background: color-mix(in srgb, var(--primary) 15%, transparent);
	}
	:global(.dark) .ai-summary-toggle {
		color: var(--primary);
	}
	.rotate-180 {
		transform: rotate(180deg);
	}
	.typing-cursor {
		color: var(--primary);
		animation: blink 1s step-end infinite;
	}
	@keyframes blink {
		50% { opacity: 0; }
	}
</style>
