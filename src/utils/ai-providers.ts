import type { AiSummaryConfig } from "../types/config.ts";

export interface AiProvider {
	generateSummary(
		title: string,
		model: string,
		content: string,
		config: AiSummaryConfig,
		apiKey: string,
	): Promise<string>;
}

const SYSTEM_PROMPT =
	"You are a helpful assistant that summarizes blog posts. Please provide a concise summary in Chinese (中文), in 3-5 sentences, regardless of the original language of the post.";

/** Maximum content length (~150K chars to leave room for system prompt + output within 200K context) */
const MAX_CONTENT_LENGTH = 150_000;

/** Max retries on 429 */
const MAX_RETRIES = 3;

/** Base backoff delays in ms: 30s, 60s, 120s */
const BACKOFF_DELAYS = [30_000, 60_000, 120_000];

async function fetchWithRetry(
	url: string,
	headers: Record<string, string>,
	body: object,
): Promise<string> {
	let lastError: Error | null = null;

	for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
		try {
			const response = await fetch(url, {
				method: "POST",
				headers,
				body: JSON.stringify(body),
			});

			if (response.status === 429) {
				if (attempt < MAX_RETRIES) {
					const delay =
						BACKOFF_DELAYS[attempt] ??
						BACKOFF_DELAYS[BACKOFF_DELAYS.length - 1];
					console.warn(
						`[ai-provider] Rate limited (429). Retrying in ${delay / 1000}s (attempt ${attempt + 1}/${MAX_RETRIES})...`,
					);
					await new Promise((r) => setTimeout(r, delay));
					continue;
				}
				throw new Error(`Rate limited after ${MAX_RETRIES} retries`);
			}

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`API error (${response.status}): ${errorText}`);
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
		new Error("[ai-provider] Unknown error during summary generation")
	);
}

function buildRequestBody(
	model: string,
	title: string,
	content: string,
	config: AiSummaryConfig,
) {
	const truncatedContent =
		content.length > MAX_CONTENT_LENGTH
			? content.slice(0, MAX_CONTENT_LENGTH)
			: content;

	return {
		model,
		max_tokens: config.maxTokens,
		messages: [
			{
				role: "system",
				content: SYSTEM_PROMPT,
			},
			{
				role: "user",
				content: `Please summarize the following blog post titled "${title}":\n\n${truncatedContent}`,
			},
		],
	};
}

// OpenRouter 适配器
const openrouterProvider: AiProvider = {
	async generateSummary(title, model, content, config, apiKey) {
		const url = "https://openrouter.ai/api/v1/chat/completions";
		const headers: Record<string, string> = {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
			"HTTP-Referer": "https://github.com/maomaoz5/fuwari",
			"X-OpenRouter-Title": "Fuwari Blog",
		};
		const body = buildRequestBody(model, title, content, config);
		return fetchWithRetry(url, headers, body);
	},
};

// OpenAI 兼容适配器（支持 DeepSeek、智谱等大多数提供商）
const openaiProvider: AiProvider = {
	async generateSummary(title, model, content, config, apiKey) {
		const baseUrl = config.baseUrl || "https://api.openai.com/v1";
		const url = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
		const headers: Record<string, string> = {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		};
		const body = buildRequestBody(model, title, content, config);
		return fetchWithRetry(url, headers, body);
	},
};

// 自定义适配器（与 openai 相同，但 baseUrl 必填）
const customProvider: AiProvider = {
	async generateSummary(title, model, content, config, apiKey) {
		if (!config.baseUrl) {
			throw new Error(
				"[ai-provider] Custom provider requires baseUrl to be set in config.",
			);
		}
		const url = `${config.baseUrl.replace(/\/$/, "")}/chat/completions`;
		const headers: Record<string, string> = {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		};
		const body = buildRequestBody(model, title, content, config);
		return fetchWithRetry(url, headers, body);
	},
};

export function getProvider(config: AiSummaryConfig): AiProvider {
	switch (config.provider) {
		case "openai":
			return openaiProvider;
		case "custom":
			return customProvider;
		default:
			return openrouterProvider;
	}
}

export function getApiKey(
	config: AiSummaryConfig,
	env: Record<string, string | undefined>,
): string {
	switch (config.provider) {
		case "openai":
			return env.OPENAI_API_KEY || "";
		case "custom":
			return env.CUSTOM_AI_API_KEY || "";
		default:
			return env.OPENROUTER_API_KEY || "";
	}
}

export function getApiKeyEnvName(config: AiSummaryConfig): string {
	switch (config.provider) {
		case "openai":
			return "OPENAI_API_KEY";
		case "custom":
			return "CUSTOM_AI_API_KEY";
		default:
			return "OPENROUTER_API_KEY";
	}
}
