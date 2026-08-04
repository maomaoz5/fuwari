import fs from "node:fs";
import path from "node:path";

const OVERRIDES_PATH = path.join(
	process.cwd(),
	"data",
	"config-overrides.json",
);

// 读取覆盖配置
export function readOverrides(): Record<string, unknown> {
	if (!fs.existsSync(OVERRIDES_PATH)) return {};
	try {
		const raw = fs.readFileSync(OVERRIDES_PATH, "utf-8");
		return JSON.parse(raw);
	} catch {
		return {};
	}
}

// 写入覆盖配置
export function writeOverrides(config: Record<string, unknown>): void {
	const dir = path.dirname(OVERRIDES_PATH);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
	fs.writeFileSync(OVERRIDES_PATH, JSON.stringify(config, null, 2), "utf-8");
}

// 深度合并两个对象（source 优先覆盖 target）
function deepMerge(
	target: Record<string, unknown>,
	source: Record<string, unknown>,
): Record<string, unknown> {
	const result: Record<string, unknown> = { ...target };
	for (const key of Object.keys(source)) {
		const srcVal = source[key];
		const tgtVal = result[key];
		if (
			srcVal !== null &&
			typeof srcVal === "object" &&
			!Array.isArray(srcVal) &&
			tgtVal !== null &&
			typeof tgtVal === "object" &&
			!Array.isArray(tgtVal)
		) {
			result[key] = deepMerge(
				tgtVal as Record<string, unknown>,
				srcVal as Record<string, unknown>,
			);
		} else {
			result[key] = srcVal;
		}
	}
	return result;
}

// 获取合并后的配置
// 注意：直接导入 src/config.ts 在 ESM 环境下有困难（路径解析、enum 等），
// 因此这里读取文件内容并提取导出的配置对象。
export async function getMergedConfig(): Promise<Record<string, unknown>> {
	// 动态导入 src/config.ts（在 Node 运行时中，Astro 的 Vite 已处理了 TS 转换）
	let defaults: Record<string, unknown> = {};
	try {
		const configModule = await import("../../config.ts");
		defaults = {
			site: configModule.siteConfig,
			navBar: configModule.navBarConfig,
			profile: configModule.profileConfig,
			license: configModule.licenseConfig,
			expressiveCode: configModule.expressiveCodeConfig,
			aiSummary: configModule.aiSummaryConfig,
			captcha: configModule.captchaConfig,
		};
	} catch {
		// 如果导入失败，返回空默认值 + 覆盖层
		defaults = {};
	}

	const overrides = readOverrides();
	return deepMerge(defaults, overrides);
}
