import { getMergedConfig } from "./config-store.js";

/**
 * 验证码验证结果上下文
 */
export type CaptchaVerificationContext = {
	captchaInfo: CaptchaInfo;
	captchaError?: CaptchaErrorInfo;
};

/**
 * 验证码验证异常
 */
export class CaptchaVerificationError extends Error {
	public readonly type: CaptchaErrorType;
	public readonly retryable: boolean;
	public readonly context: CaptchaVerificationContext;

	constructor(
		errorInfo: CaptchaErrorInfo,
		context: CaptchaVerificationContext,
	) {
		super(errorInfo.message);
		this.name = "CaptchaVerificationError";
		this.type = errorInfo.type;
		this.retryable = errorInfo.retryable;
		this.context = context;
	}

	toErrorInfo(): CaptchaErrorInfo {
		return {
			type: this.type,
			message: this.message,
			retryable: this.retryable,
		};
	}
}

/**
 * 验证码错误类型
 */
export type CaptchaErrorType =
	| "network_error"
	| "missing_token"
	| "invalid_token"
	| "timeout"
	| "config_error"
	| "unknown";

/**
 * 验证码错误信息
 */
export type CaptchaErrorInfo = {
	type: CaptchaErrorType;
	message: string;
	retryable: boolean;
};

/**
 * 验证码配置信息（公开给前端）
 */
export type CaptchaInfo = {
	enabled: boolean;
	provider: "turnstile" | "hcaptcha" | "none";
	siteKey: string;
};

/**
 * 获取当前验证码 provider 类型
 */
export async function getCaptchaProvider(): Promise<
	"turnstile" | "hcaptcha" | "none"
> {
	const config = (await getMergedConfig()) as Record<string, unknown>;
	const captcha = (config.captcha || { provider: "turnstile" }) as Record<
		string,
		string
	>;
	const provider = captcha.provider || "turnstile";
	if (provider !== "turnstile" && provider !== "hcaptcha" && provider !== "none")
		return "turnstile";
	return provider;
}

/**
 * 判断当前是否启用了验证码
 */
export async function isCaptchaEnabled(): Promise<boolean> {
	const provider = await getCaptchaProvider();
	return provider !== "none";
}

/**
 * 获取当前 provider 对应的 siteKey（公开，用于前端渲染）
 */
export async function getCaptchaSiteKey(): Promise<string> {
	const provider = await getCaptchaProvider();
	if (provider === "none") return "";

	const config = (await getMergedConfig()) as Record<string, unknown>;
	const captcha = (config.captcha || {}) as Record<string, string>;

	return provider === "turnstile"
		? (captcha.turnstileSiteKey || "")
		: provider === "hcaptcha"
			? (captcha.hcaptchaSiteKey || "")
			: "";
}

/**
 * 获取当前 provider 对应的 secretKey（私密，仅后端使用）
 */
export async function getCaptchaSecretKey(): Promise<string> {
	const provider = await getCaptchaProvider();
	return provider === "turnstile"
		? (process.env.TURNSTILE_SECRET_KEY || "")
		: provider === "hcaptcha"
			? (process.env.HCAPTCHA_SECRET_KEY || "")
			: "";
}

/**
 * 统一验证码验证
 * 验证失败时抛出 CaptchaVerificationError
 */
export async function verifyCaptcha(
	token: string,
	context: CaptchaVerificationContext,
): Promise<CaptchaVerificationContext> {
	const enabled = await isCaptchaEnabled();
	if (!enabled) {
		return context;
	}

	if (!token) {
		const errorInfo: CaptchaErrorInfo = {
			type: "missing_token",
			message: "请先完成验证码验证",
			retryable: false,
		};
		throw new CaptchaVerificationError(errorInfo, {
			...context,
			captchaError: errorInfo,
		});
	}

	const provider = await getCaptchaProvider();
	const secretKey = await getCaptchaSecretKey();
	if (!secretKey) {
		const errorInfo: CaptchaErrorInfo = {
			type: "config_error",
			message: "验证码服务配置错误",
			retryable: false,
		};
		throw new CaptchaVerificationError(errorInfo, {
			...context,
			captchaError: errorInfo,
		});
	}

	const url =
		provider === "turnstile"
			? "https://challenges.cloudflare.com/turnstile/v0/siteverify"
			: "https://hcaptcha.com/siteverify";

	let data: { success: boolean; error_codes?: string[] };
	try {
		const response = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				secret: secretKey,
				response: token,
			}),
		});
		data = await response.json();
	} catch {
		const errorInfo: CaptchaErrorInfo = {
			type: "network_error",
			message: "网络错误，请重试",
			retryable: true,
		};
		throw new CaptchaVerificationError(errorInfo, {
			...context,
			captchaError: errorInfo,
		});
	}

	if (data.success !== true) {
		const errorCode = data.error_codes?.[0];
		const errorInfo = mapCaptchaErrorCode(provider, errorCode);
		throw new CaptchaVerificationError(errorInfo, {
			...context,
			captchaError: errorInfo,
		});
	}

	return context;
}

/**
 * 映射验证码错误码到错误信息
 */
export function mapCaptchaErrorCode(
	provider: string,
	errorCode?: string,
): CaptchaErrorInfo {
	if (!errorCode) {
		return { type: "unknown", message: "验证码验证失败", retryable: true };
	}

	// 通用网络错误
	if (errorCode === "network_error") {
		return {
			type: "network_error",
			message: "网络错误，请重试",
			retryable: true,
		};
	}

	// Token 缺失
	if (errorCode === "missing_token") {
		return {
			type: "missing_token",
			message: "请先完成验证码验证",
			retryable: false,
		};
	}

	// 密钥缺失
	if (errorCode === "missing_secret") {
		return {
			type: "config_error",
			message: "验证码服务配置错误",
			retryable: false,
		};
	}

	// Turnstile 特定错误
	if (provider === "turnstile") {
		switch (errorCode) {
			case "invalid-input-response":
			case "bad-response":
				return {
					type: "invalid_token",
					message: "验证码已过期，请刷新",
					retryable: true,
				};
			case "timeout-or-duplicate":
				return {
					type: "timeout",
					message: "验证码超时，请刷新重试",
					retryable: true,
				};
		}
	}

	// hCaptcha 特定错误
	if (provider === "hcaptcha") {
		switch (errorCode) {
			case "invalid-passcode":
			case "challenge-closed":
				return {
					type: "invalid_token",
					message: "验证码已过期，请刷新",
					retryable: true,
				};
			case "rate-limited":
				return {
					type: "invalid_token",
					message: "操作过于频繁，请稍后再试",
					retryable: true,
				};
		}
	}

	// 通用验证失败
	if (errorCode === "verification_failed") {
		return {
			type: "invalid_token",
			message: "验证码验证失败",
			retryable: true,
		};
	}

	return { type: "unknown", message: "验证码验证失败", retryable: true };
}

/**
 * 构建验证码错误信息（用于后端日志和响应）
 */
export async function buildCaptchaErrorInfo(
	errorCode?: string,
): Promise<CaptchaErrorInfo> {
	const provider = await getCaptchaProvider();
	return mapCaptchaErrorCode(provider, errorCode);
}

/**
 * 构建给前端的验证码配置信息
 */
export async function buildCaptchaInfo(): Promise<CaptchaInfo> {
	const provider = await getCaptchaProvider();
	const enabled = provider !== "none";
	const siteKey = enabled ? await getCaptchaSiteKey() : "";
	return { enabled, provider, siteKey };
}

/**
 * 获取当前验证码配置（用于前端 API，兼容旧名称）
 */
export async function getCaptchaConfig(): Promise<CaptchaInfo> {
	return buildCaptchaInfo();
}
