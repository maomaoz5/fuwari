<script lang="ts">
import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import Icon from "@iconify/svelte";
import { onDestroy } from "svelte";
import { fade, slide } from "svelte/transition";

export let slug: string;

let expanded = false;
let loading = false;
let error = false;
let summary = "";
let displayedText = "";
let isTyping = false;
let hasFullyDisplayed = false;
let typingComplete = false;
let typingInterval: ReturnType<typeof setInterval>;

const toggle = () => {
	expanded = !expanded;
	if (expanded && !summary && !loading) {
		fetchSummary();
	}
};

const getTypingDelay = (char: string): number => {
	if (char === "，" || char === ",") return 80;
	if (char === "。" || char === "." || char === "！" || char === "？")
		return 130;
	if (char === "；" || char === ";" || char === "：" || char === ":")
		return 100;
	if (char === "、" || char === "…" || char === "—") return 90;
	if (char === "\n") return 150;
	return 20 + Math.random() * 15;
};

const startTyping = (text: string) => {
	displayedText = "";
	isTyping = true;
	hasFullyDisplayed = false;
	typingComplete = false;
	let index = 0;

	const typeNext = () => {
		if (index >= text.length) {
			displayedText = text;
			isTyping = false;
			hasFullyDisplayed = true;
			clearInterval(typingInterval);
			setTimeout(() => {
				typingComplete = true;
			}, 200);
			return;
		}
		const currentChar = text[index];
		const chunkSize = Math.floor(Math.random() * 2) + 2;
		index += chunkSize;
		if (index >= text.length) {
			displayedText = text;
			isTyping = false;
			hasFullyDisplayed = true;
			clearInterval(typingInterval);
			setTimeout(() => {
				typingComplete = true;
			}, 200);
		} else {
			displayedText = text.slice(0, index);
			const delay = getTypingDelay(currentChar);
			clearInterval(typingInterval);
			typingInterval = setInterval(typeNext, delay);
		}
	};

	typingInterval = setInterval(typeNext, 30);
};

const fetchSummary = async () => {
	loading = true;
	error = false;
	typingComplete = false;
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

<div class="ai-summary-wrapper onload-animation" class:typing-done={typingComplete}>
	<button
		class="ai-summary-toggle"
		class:is-expanded={expanded}
		on:click={toggle}
		aria-expanded={expanded}
		aria-label={i18n(I18nKey.aiSummary)}
	>
		<span class="toggle-icon">
			<Icon icon="material-symbols:auto-awesome-outline" class="text-[1.125rem]" />
		</span>
		<span class="toggle-label">{i18n(I18nKey.aiSummary)}</span>
		<span class="toggle-arrow" class:rotated={expanded}>
			<Icon icon="material-symbols:keyboard-arrow-down-rounded" class="text-[1.125rem]" />
		</span>
	</button>

	{#if expanded}
		<div
			class="ai-summary-card"
			class:typing-done={typingComplete}
			in:fade={{ duration: 300, delay: 50 }}
		>
			<div class="card-accent"></div>
			<div class="card-inner" transition:slide={{ duration: 280, easing: (t) => t * (2 - t) }}>
				{#if loading}
					<div class="loading-state">
						<div class="loading-dots">
							<span></span>
							<span></span>
							<span></span>
						</div>
					</div>
				{:else if error}
					<div class="error-state" in:fade={{ duration: 200 }}>
						<Icon icon="material-symbols:error-outline-rounded" class="text-[1.125rem]" />
						<span>{i18n(I18nKey.aiSummaryError)}</span>
					</div>
				{:else if summary}
					<div class="summary-content">
						<p class="summary-text text-black/70 dark:text-white/70 transition-colors duration-300">{hasFullyDisplayed ? summary : displayedText}{#if isTyping}<span class="typing-cursor"></span>{/if}</p>
					</div>
					<div class="summary-footer">
						<Icon icon="material-symbols:auto-awesome-outline" class="footer-icon" />
						<span class="footer-text">{i18n(I18nKey.aiSummaryGeneratedBy)}</span>
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	:root {
		--ease-smooth: cubic-bezier(0.4, 0, 0.2, 1);
		--ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	.ai-summary-wrapper {
		margin-bottom: 1rem;
		position: relative;
	}

	/* ===== Toggle Button ===== */
	.ai-summary-toggle {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.4rem 0.9rem;
		border-radius: 0.75rem;
		font-size: 0.875rem;
		color: var(--primary);
		background: color-mix(in srgb, var(--primary) 8%, transparent);
		border: 1px solid color-mix(in srgb, var(--primary) 18%, transparent);
		cursor: pointer;
		transition: all 0.3s var(--ease-smooth);
		position: relative;
		overflow: hidden;
	}
	.ai-summary-toggle::before {
		content: "";
		position: absolute;
		inset: 0;
		border-radius: inherit;
		background: radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--primary) 20%, transparent), transparent 70%);
		opacity: 0;
		transition: opacity 0.3s var(--ease-smooth);
		pointer-events: none;
	}
	.ai-summary-toggle:hover {
		background: color-mix(in srgb, var(--primary) 14%, transparent);
		border-color: color-mix(in srgb, var(--primary) 30%, transparent);
		transform: scale(1.03);
		box-shadow: 0 0 12px color-mix(in srgb, var(--primary) 15%, transparent);
	}
	.ai-summary-toggle:hover::before {
		opacity: 1;
	}
	.ai-summary-toggle:active {
		transform: scale(0.98);
	}
	.ai-summary-toggle.is-expanded {
		background: color-mix(in srgb, var(--primary) 16%, transparent);
		border-color: color-mix(in srgb, var(--primary) 40%, transparent);
		box-shadow: 0 0 16px color-mix(in srgb, var(--primary) 12%, transparent),
			inset 0 1px 0 color-mix(in srgb, var(--primary) 10%, transparent);
	}

	.toggle-icon {
		display: flex;
		align-items: center;
		transition: transform 0.3s var(--ease-smooth);
	}
	.ai-summary-toggle:hover .toggle-icon {
		transform: scale(1.1);
	}

	.toggle-label {
		font-weight: 500;
		letter-spacing: 0.01em;
	}

	.toggle-arrow {
		display: flex;
		align-items: center;
		transition: transform 0.35s var(--ease-smooth);
	}
	.toggle-arrow.rotated {
		transform: rotate(180deg);
	}

	:global(.dark) .ai-summary-toggle {
		color: var(--primary);
	}

	/* ===== Content Card ===== */
	.ai-summary-card {
		position: relative;
		margin-top: 0.5rem;
		border-radius: 0.875rem;
		background: color-mix(in srgb, var(--card-bg, var(--base-bg, #fff)) 85%, transparent);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border: 1px solid color-mix(in srgb, var(--primary) 12%, transparent);
		box-shadow: 0 2px 12px color-mix(in srgb, var(--primary) 6%, transparent),
			0 1px 3px rgba(0, 0, 0, 0.04);
		overflow: hidden;
		transition: box-shadow 0.3s var(--ease-smooth), border-color 0.3s var(--ease-smooth);
	}
	.ai-summary-card:hover {
		box-shadow: 0 4px 20px color-mix(in srgb, var(--primary) 10%, transparent),
			0 2px 6px rgba(0, 0, 0, 0.06);
		border-color: color-mix(in srgb, var(--primary) 22%, transparent);
	}

	:global(.dark) .ai-summary-card {
		background: color-mix(in srgb, var(--card-bg, var(--base-bg, #1a1a2e)) 80%, transparent);
		border-color: color-mix(in srgb, var(--primary) 15%, transparent);
		box-shadow: 0 2px 12px rgba(0, 0, 0, 0.2), 0 1px 3px rgba(0, 0, 0, 0.1);
	}
	:global(.dark) .ai-summary-card:hover {
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3), 0 2px 6px rgba(0, 0, 0, 0.15);
		border-color: color-mix(in srgb, var(--primary) 28%, transparent);
	}

	/* Typing complete flash */
	.ai-summary-card.typing-done {
		animation: border-flash 0.8s var(--ease-smooth);
	}
	@keyframes border-flash {
		0% { border-color: color-mix(in srgb, var(--primary) 12%, transparent); }
		30% { border-color: color-mix(in srgb, var(--primary) 60%, transparent); box-shadow: 0 0 20px color-mix(in srgb, var(--primary) 20%, transparent); }
		100% { border-color: color-mix(in srgb, var(--primary) 12%, transparent); box-shadow: 0 2px 12px color-mix(in srgb, var(--primary) 6%, transparent); }
	}

	/* Left accent line */
	.card-accent {
		position: absolute;
		left: 0;
		top: 0.5rem;
		bottom: 0.5rem;
		width: 3px;
		border-radius: 0 3px 3px 0;
		background: linear-gradient(180deg, var(--primary), color-mix(in srgb, var(--primary) 40%, transparent));
		opacity: 0.7;
		transition: opacity 0.3s var(--ease-smooth);
	}
	.ai-summary-card:hover .card-accent {
		opacity: 1;
	}

	.card-inner {
		padding: 1rem 1.125rem 0.875rem 1.25rem;
	}

	/* ===== Loading State ===== */
	.loading-state {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.75rem 0;
	}
	.loading-dots {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}
	.loading-dots span {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--primary);
		opacity: 0.4;
		animation: dot-wave 1.2s var(--ease-smooth) infinite;
	}
	.loading-dots span:nth-child(2) {
		animation-delay: 0.15s;
	}
	.loading-dots span:nth-child(3) {
		animation-delay: 0.3s;
	}
	@keyframes dot-wave {
		0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
		30% { transform: translateY(-6px); opacity: 1; }
	}

	/* ===== Error State ===== */
	.error-state {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
		color: #ef4444;
	}
	:global(.dark) .error-state {
		color: #f87171;
	}

	/* ===== Summary Content ===== */
	.summary-content {
		position: relative;
	}
	.summary-text {
		font-size: 0.875rem;
		line-height: 1.75;
		margin: 0;
		transition: color 0.3s var(--ease-smooth);
	}

	/* ===== Typing Cursor (CSS pseudo-element) ===== */
	.typing-cursor {
		display: inline-block;
		width: 2px;
		height: 1em;
		background: var(--primary);
		margin-left: 1px;
		vertical-align: text-bottom;
		border-radius: 1px;
		animation: cursor-blink 0.9s ease-in-out infinite;
	}
	@keyframes cursor-blink {
		0%, 100% { opacity: 1; }
		50% { opacity: 0; }
	}

	/* ===== Footer ===== */
	.summary-footer {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		margin-top: 0.75rem;
		padding-top: 0.625rem;
		border-top: 1px solid color-mix(in srgb, var(--primary) 8%, transparent);
	}
	.footer-icon {
		font-size: 0.8rem;
		color: var(--primary);
		opacity: 0.5;
	}
	.footer-text {
		font-size: 0.75rem;
		letter-spacing: 0.02em;
		background: linear-gradient(90deg, color-mix(in srgb, var(--primary) 60%, transparent), color-mix(in srgb, var(--primary) 35%, transparent));
		-webkit-background-clip: text;
		background-clip: text;
		-webkit-text-fill-color: transparent;
	}
</style>
