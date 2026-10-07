import fs from "node:fs";
import path from "node:path";

function getOverridesPath(): string {
	return (
		process.env.CONFIG_OVERRIDES_PATH ||
		path.join(process.cwd(), "data", "config-overrides.json")
	);
}

// 读取覆盖配置
export function readOverrides(): Record<string, unknown> {
	const overridesPath = getOverridesPath();
	if (!fs.existsSync(overridesPath)) return {};
	try {
		const raw = fs.readFileSync(overridesPath, "utf-8");
		return JSON.parse(raw);
	} catch {
		return {};
	}
}

// 写入覆盖配置
export function writeOverrides(config: Record<string, unknown>): void {
	const overridesPath = getOverridesPath();
	const dir = path.dirname(overridesPath);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
	fs.writeFileSync(overridesPath, JSON.stringify(config, null, 2), "utf-8");
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
export async function getMergedConfig(): Promise<Record<string, unknown>> {
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
		defaults = {};
	}

	const overrides = readOverrides();
	return deepMerge(defaults, overrides);
}
