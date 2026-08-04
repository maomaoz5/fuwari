import { loadEnv } from "vite";
import type { AiSummaryConfig } from "../types/config.ts";
import { getApiKey, getApiKeyEnvName, getProvider } from "./ai-providers.ts";
import {
	computeContentHash,
	ensureCacheDir,
	isCacheValid,
	type SummaryCacheEntry,
	writeCacheEntry,
} from "./ai-summary-cache.ts";

/** Delay between API calls in ms */
const REQUEST_DELAY_MS = 3000;

/**
 * Call the AI provider API to generate a summary for a single blog post.
 */
export async function generateSummary(
	title: string,
	content: string,
	config: AiSummaryConfig,
): Promise<string> {
	const env = loadEnv(process.env.NODE_ENV ?? "production", process.cwd(), "");
	const apiKey = getApiKey(config, env);
	if (!apiKey) {
		const envName = getApiKeyEnvName(config);
		throw new Error(
			`[ai-summary] ${envName} is not set. Please set it in your environment variables.`,
		);
	}

	const provider = getProvider(config);
	return provider.generateSummary(title, config.model, content, config, apiKey);
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
