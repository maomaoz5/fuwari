import fs from "node:fs";
import path from "node:path";
import type { AiSummaryConfig } from "../../types/config";
import { generateSummary } from "../../utils/ai-summary";
import {
	computeContentHash,
	type SummaryCacheEntry,
	writeCacheEntry,
} from "../../utils/ai-summary-cache";
import { getApiKey, getApiKeyEnvName } from "../../utils/ai-providers";
import { getMergedConfig } from "./config-store";
import { readPost } from "./post-files";

export type { SummaryCacheEntry };

export type SummaryFile = {
	slug: string;
	size: number;
	modifiedAt: string;
};

export type AiSummaryErrorCode =
	| "disabled"
	| "missing_api_key"
	| "not_found"
	| "provider_error";

export class AiSummaryError extends Error {
	constructor(
		public readonly code: AiSummaryErrorCode,
		message: string,
	) {
		super(message);
		this.name = "AiSummaryError";
	}
}

export function getSummariesDir(): string {
	return (
		process.env.AI_SUMMARIES_DIR ||
		path.join(process.cwd(), "public", "ai-summaries")
	);
}

/**
 * 前台实际读取的是构建产物里的副本（public/ → dist/client/）。
 * 后台重新生成后若只写 public/，页面不会变化，因此这里同步镜像一份。
 * 测试或自定义 AI_SUMMARIES_DIR 时不做镜像，避免污染构建产物。
 */
function getClientMirrorDir(): string | null {
	if (process.env.AI_SUMMARIES_DIR) return null;
	const dir = path.join(process.cwd(), "dist", "client", "ai-summaries");
	return fs.existsSync(dir) ? dir : null;
}

function mirrorToClient(slug: string): void {
	const mirrorDir = getClientMirrorDir();
	if (!mirrorDir) return;
	fs.copyFileSync(
		path.join(getSummariesDir(), `${slug}.json`),
		path.join(mirrorDir, `${slug}.json`),
	);
}

function removeFromClient(slug: string): void {
	const mirrorDir = getClientMirrorDir();
	if (!mirrorDir) return;
	const filePath = path.join(mirrorDir, `${slug}.json`);
	if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

export function listSummaries(): SummaryFile[] {
	const dir = getSummariesDir();
	if (!fs.existsSync(dir)) return [];
	return fs
		.readdirSync(dir)
		.filter((f) => f.endsWith(".json"))
		.map((file) => {
			const stat = fs.statSync(path.join(dir, file));
			return {
				slug: file.replace(/\.json$/, ""),
				size: stat.size,
				modifiedAt: stat.mtime.toISOString(),
			};
		});
}

export function deleteSummary(slug: string): boolean {
	const filePath = path.join(getSummariesDir(), `${slug}.json`);
	if (!fs.existsSync(filePath)) return false;
	fs.unlinkSync(filePath);
	removeFromClient(slug);
	return true;
}

/** 从合并配置中取出 aiSummary 段，缺省值与 src/config.ts 保持一致 */
async function resolveConfig(): Promise<AiSummaryConfig> {
	const merged = await getMergedConfig();
	const raw = (merged.aiSummary ?? {}) as Partial<AiSummaryConfig>;
	const config: AiSummaryConfig = {
		enable: raw.enable ?? true,
		provider: raw.provider ?? "openrouter",
		model: raw.model ?? "openrouter/free",
		maxTokens: raw.maxTokens ?? 500,
		baseUrl: raw.baseUrl,
	};
	if (!config.enable) {
		throw new AiSummaryError("disabled", "AI 摘要功能未启用");
	}
	return config;
}

/**
 * 为单篇文章重新生成摘要并写入缓存，供后台"重新生成"使用。
 * 与构建期 batch 流程共用 generateSummary，区别只是内容来自当前 md 文件而非构建快照。
 */
export async function regenerateSummary(
	slug: string,
): Promise<SummaryCacheEntry> {
	const config = await resolveConfig();

	const apiKey = getApiKey(config, process.env);
	if (!apiKey) {
		const envName = getApiKeyEnvName(config);
		throw new AiSummaryError(
			"missing_api_key",
			`${envName} 未配置，无法生成摘要`,
		);
	}

	const post = readPost(slug);
	if (!post) {
		throw new AiSummaryError("not_found", "文章不存在");
	}

	let summary: string;
	try {
		summary = await generateSummary(post.title, post.content, config);
	} catch (err) {
		throw new AiSummaryError(
			"provider_error",
			err instanceof Error ? err.message : "AI 服务调用失败",
		);
	}

	const entry: SummaryCacheEntry = {
		title: post.title,
		summary,
		generatedAt: new Date().toISOString(),
		contentHash: computeContentHash(post.content),
	};

	writeCacheEntry(getSummariesDir(), slug, entry);
	mirrorToClient(slug);
	return entry;
}
