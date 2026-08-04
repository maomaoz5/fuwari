import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { AstroIntegration } from "astro";
import { loadEnv } from "vite";
import { aiSummaryConfig } from "../config.ts";
import { getApiKey, getApiKeyEnvName } from "../utils/ai-providers.ts";
import { generateAllSummaries } from "../utils/ai-summary.ts";
import { ensureCacheDir } from "../utils/ai-summary-cache.ts";

/**
 * Parse frontmatter from a markdown file's raw content.
 * Returns the frontmatter fields and the body content (without frontmatter).
 */
function parseFrontmatter(raw: string): {
	title: string;
	draft: boolean;
	content: string;
} {
	const fmRegex = /^---\n([\s\S]*?)\n---/;
	const match = raw.match(fmRegex);

	let title = "";
	let draft = false;
	let content = raw;

	if (match) {
		const fmBlock = match[1];
		content = raw.slice(match[0].length).trim();

		const titleMatch = fmBlock.match(/^title:\s*(.+)$/m);
		if (titleMatch) {
			title = titleMatch[1].trim().replace(/^["']|["']$/g, "");
		}

		const draftMatch = fmBlock.match(/^draft:\s*(true|false)/m);
		if (draftMatch) {
			draft = draftMatch[1] === "true";
		}
	}

	return { title, draft, content };
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
						const { title, draft, content } = parseFrontmatter(raw);

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
