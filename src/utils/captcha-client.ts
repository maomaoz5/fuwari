/**
 * 客户端验证码工具函数
 * 封装 SDK 加载、渲染、Token 获取和 Widget 移除
 */

type CaptchaProvider = "turnstile" | "hcaptcha";

/**
 * 加载验证码 SDK
 * 如果 SDK 已加载则直接 resolve
 */
export function loadCaptchaSdk(provider: CaptchaProvider): Promise<void> {
	return new Promise((resolve, reject) => {
		if (provider === "turnstile" && window.turnstile) {
			resolve();
			return;
		}
		if (provider === "hcaptcha" && window.hcaptcha) {
			resolve();
			return;
		}

		// 检查是否已有正在加载的 script
		const existingScript = document.querySelector(
			provider === "turnstile"
				? 'script[src*="turnstile"]'
				: 'script[src*="hcaptcha"]',
		);
		if (existingScript) {
			// 等待已有 script 加载完成
			existingScript.addEventListener("load", () => resolve());
			existingScript.addEventListener("error", () =>
				reject(new Error("Failed to load captcha SDK")),
			);
			return;
		}

		const script = document.createElement("script");
		if (provider === "turnstile") {
			script.src =
				"https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
		} else {
			script.src = "https://js.hcaptcha.com/1/api.js?render=explicit";
		}
		script.async = true;
		script.defer = true;
		script.onload = () => resolve();
		script.onerror = () => reject(new Error("Failed to load captcha SDK"));
		document.head.appendChild(script);
	});
}

/**
 * 渲染验证码 widget
 * @returns widget ID，失败返回 null
 */
export function renderCaptcha(
	container: HTMLElement,
	provider: CaptchaProvider,
	siteKey: string,
): string | null {
	container.innerHTML = "";
	if (provider === "turnstile" && window.turnstile) {
		return window.turnstile.render(container, { sitekey: siteKey });
	}
	if (provider === "hcaptcha" && window.hcaptcha) {
		return window.hcaptcha.render(container, { sitekey: siteKey });
	}
	return null;
}

/**
 * 获取验证码 token
 */
export function getCaptchaToken(
	container: HTMLElement | Document,
	provider: CaptchaProvider,
): string | null {
	if (provider === "turnstile") {
		const input = container.querySelector(
			'input[name="cf-turnstile-response"]',
		) as HTMLInputElement | null;
		return input?.value || null;
	}
	if (provider === "hcaptcha") {
		const input = container.querySelector(
			'input[name="h-captcha-response"]',
		) as HTMLInputElement | null;
		return input?.value || null;
	}
	return null;
}

/**
 * 移除验证码 widget
 */
export function removeCaptcha(
	provider: CaptchaProvider,
	widgetId: string,
): void {
	if (provider === "turnstile" && window.turnstile) {
		window.turnstile.remove(widgetId);
	}
	if (provider === "hcaptcha" && window.hcaptcha) {
		window.hcaptcha.remove(widgetId);
	}
}
