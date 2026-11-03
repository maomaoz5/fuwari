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
 * 解析环境变量：`.env` 文件（构建期）与 process.env（运行期）合并，后者优先。
 *
 * 构建期 Astro 通过 vite 读取 `.env`；运行期（后台点击"重新生成"）没有 `.env`，
 * key 来自进程环境（PM2 ecosystem / --env-file）。vite 不可用时静默退化为 process.env。
 */
async function resolveEnv(): Promise<Record<string, string | undefined>> {
	let fileEnv: Record<string, string> = {};
	try {
		const { loadEnv } = await import("vite");
		fileEnv = loadEnv(process.env.NODE_ENV ?? "production", process.cwd(), "");
	} catch {
		fileEnv = {};
	}
	return { ...fileEnv, ...process.env };
}

/**
 * Call the AI provider API to generate a summary for a single blog post.
 */
export async function generateSummary(
	title: string,
	content: string,
	config: AiSummaryConfig,
): Promise<string> {
	const env = await resolveEnv();
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
