import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { AstroIntegration } from "astro";
import matter from "gray-matter";
import { loadEnv } from "vite";
import { aiSummaryConfig } from "../config.ts";
import { getApiKey, getApiKeyEnvName } from "../utils/ai-providers.ts";
import { generateAllSummaries } from "../utils/ai-summary.ts";
import { ensureCacheDir } from "../utils/ai-summary-cache.ts";

/**
 * 解析文章 frontmatter 与正文。
 *
 * 必须与后台运行时（services/post-files.ts，用 gray-matter）保持一致：
 * 缓存以正文内容的 hash 判重，任一侧解析方式不同都会导致「永远判不中、每次构建都重调 AI」。
 * 早期这里用手写正则，遇到 CRLF 文件会匹配失败，导致 title 为空且正文混入 frontmatter。
 */
function parsePost(raw: string): { title: string; draft: boolean; content: string } {
	const { data, content } = matter(raw);
	return {
		title: typeof data.title === "string" ? data.title : "",
		draft: data.draft === true,
		content,
	};
}

export default function aiSummaryIntegration(): AstroIntegration {
	return {
		name: "ai-summary",
		hooks: {
			"astro:build:start": async () => {
				try {
					// 1. Check enable config
					if (!aiSummaryConfig.enable) {
						console.log("[ai-summary] AI summary is disabled, skipping.");
						return;
					}

					// 2. Check API Key based on provider
					const env = loadEnv(
						process.env.NODE_ENV ?? "production",
						process.cwd(),
						"",
					);
					const apiKey = getApiKey(aiSummaryConfig, env);
					if (!apiKey) {
						const envName = getApiKeyEnvName(aiSummaryConfig);
						console.warn(
							`[ai-summary] ${envName} is not set, skipping AI summary generation.`,
						);
						return;
					}

					// 3. Scan posts directory
					const postsDir = join(process.cwd(), "src/content/posts");
					const files = readdirSync(postsDir).filter(
						(f) => f.endsWith(".md") || f.endsWith(".mdx"),
					);

					const posts: Array<{
						slug: string;
						title: string;
						content: string;
					}> = [];

					for (const file of files) {
						const raw = readFileSync(join(postsDir, file), "utf-8");
						const { title, draft, content } = parsePost(raw);

						if (draft) {
							continue;
						}

						const slug = basename(file).replace(/\.(md|mdx)$/, "");
						posts.push({ slug, title, content });
					}

					if (posts.length === 0) {
						console.log("[ai-summary] No posts found, skipping.");
						return;
					}

					// 4. Ensure cache directory exists
					const cacheDir = join(process.cwd(), "public/ai-summaries");
					ensureCacheDir(cacheDir);

					// 5 & 6. Generate summaries (generateAllSummaries handles cache checking internally)
					await generateAllSummaries(posts, cacheDir, aiSummaryConfig);

					// 7. Done
					console.log("[ai-summary] AI summary generation complete.");
				} catch (err) {
					console.error(
						"[ai-summary] Unexpected error during AI summary generation:",
						err instanceof Error ? err.message : err,
					);
				}
			},
		},
	};
}
