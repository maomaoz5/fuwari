import type { AiSummaryConfig } from "../types/config.ts";
import { loadEnv } from "vite";
import {
	computeContentHash,
	ensureCacheDir,
	isCacheValid,
	type SummaryCacheEntry,
	writeCacheEntry,
} from "./ai-summary-cache.ts";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

/** Maximum content length (~150K chars to leave room for system prompt + output within 200K context) */
const MAX_CONTENT_LENGTH = 150_000;

/** Delay between API calls in ms */
const REQUEST_DELAY_MS = 3000;

/** Max retries on 429 */
const MAX_RETRIES = 3;

/** Base backoff delays in ms: 30s, 60s, 120s */
const BACKOFF_DELAYS = [30_000, 60_000, 120_000];

/**
 * Call the OpenRouter API to generate a summary for a single blog post.
 */
export async function generateSummary(
	title: string,
	content: string,
	config: AiSummaryConfig,
): Promise<string> {
	const env = loadEnv(process.env.NODE_ENV ?? "production", process.cwd(), "");
	const apiKey = env.OPENROUTER_API_KEY;
	if (!apiKey) {
		throw new Error(
			"[ai-summary] OPENROUTER_API_KEY is not set. Please set it in your environment variables.",
		);
	}

	// Truncate content to ~150K chars
	const truncatedContent =
		content.length > MAX_CONTENT_LENGTH
			? content.slice(0, MAX_CONTENT_LENGTH)
			: content;

	const body = {
		model: config.model,
		max_tokens: config.maxTokens,
		messages: [
			{
				role: "system",
				content:
					"You are a helpful assistant that summarizes blog posts. Please provide a concise summary in Chinese (中文), in 3-5 sentences, regardless of the original language of the post."
			},
			{
				role: "user",
				content: `Please summarize the following blog post titled "${title}":\n\n${truncatedContent}`,
			},
		],
	};

	let lastError: Error | null = null;

	for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
		try {
			const response = await fetch(OPENROUTER_API_URL, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${apiKey}`,
					"Content-Type": "application/json",
					"HTTP-Referer": "https://github.com",
					"X-OpenRouter-Title": "Fuwari Blog",
				},
				body: JSON.stringify(body),
			});

			if (response.status === 429) {
				if (attempt < MAX_RETRIES) {
					const delay =
						BACKOFF_DELAYS[attempt] ??
						BACKOFF_DELAYS[BACKOFF_DELAYS.length - 1];
					console.warn(
						`[ai-summary] Rate limited (429). Retrying in ${delay / 1000}s (attempt ${attempt + 1}/${MAX_RETRIES})...`,
					);
					await new Promise((r) => setTimeout(r, delay));
					continue;
				}
				throw new Error(`Rate limited after ${MAX_RETRIES} retries`);
			}

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(
					`OpenRouter API error (${response.status}): ${errorText}`,
				);
			}

			const data = (await response.json()) as {
				choices: Array<{ message: { content: string } }>;
			};
			return data.choices[0].message.content;
		} catch (err) {
			lastError = err instanceof Error ? err : new Error(String(err));

			// Don't retry non-429 errors
			if (!lastError.message.includes("Rate limited")) {
				throw lastError;
			}
		}
	}

	throw (
		lastError ??
		new Error("[ai-summary] Unknown error during summary generation")
	);
}

/**
 * Batch-generate summaries for all posts with serial execution, rate control, and caching.
 */
export async function generateAllSummaries(
	posts: Array<{ slug: string; title: string; content: string }>,
	cacheDir: string,
	config: AiSummaryConfig,
): Promise<void> {
	ensureCacheDir(cacheDir);

	console.log(
		`[ai-summary] Starting batch summary generation for ${posts.length} post(s)...`,
	);

	for (let i = 0; i < posts.length; i++) {
		const post = posts[i];

		// Check cache first
		if (isCacheValid(cacheDir, post.slug, post.content)) {
			console.log(`[ai-summary] Cached, skipping: ${post.title}`);
			continue;
		}

		console.log(`[ai-summary] Generating summary for: ${post.title}`);

		try {
			const summary = await generateSummary(post.title, post.content, config);

			const entry: SummaryCacheEntry = {
				title: post.title,
				summary,
				generatedAt: new Date().toISOString(),
				contentHash: computeContentHash(post.content),
			};

			writeCacheEntry(cacheDir, post.slug, entry);
			console.log(`[ai-summary] Summary saved for: ${post.title}`);
		} catch (err) {
			console.warn(
				`[ai-summary] Failed to generate summary for "${post.title}":`,
				err instanceof Error ? err.message : err,
			);
		}

		// Rate limit delay between requests (skip after last post)
		if (i < posts.length - 1) {
			await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
		}
	}

	console.log("[ai-summary] Batch summary generation complete.");
}
