import { describe, expect, it } from "vitest";
import {
	buildCaptchaInfo,
	getCaptchaProvider,
	mapCaptchaErrorCode,
	verifyCaptcha,
} from "./captcha";

// vitest.setup.ts 已把 CONFIG_OVERRIDES_PATH 指向 provider=none 的临时文件

describe("captcha service", () => {
	it("resolves provider from overrides (none in tests)", async () => {
		expect(await getCaptchaProvider()).toBe("none");
	});

	it("buildCaptchaInfo disabled when provider none", async () => {
		expect(await buildCaptchaInfo()).toEqual({
			enabled: false,
			provider: "none",
			siteKey: "",
		});
	});

	it("verifyCaptcha is a no-op when disabled", async () => {
		const ctx = { captchaInfo: await buildCaptchaInfo() };
		await expect(verifyCaptcha("", ctx)).resolves.toBe(ctx);
	});

	it("maps turnstile error codes", () => {
		expect(mapCaptchaErrorCode("turnstile", "timeout-or-duplicate")).toMatchObject(
			{
				type: "timeout",
				retryable: true,
			},
		);
		expect(mapCaptchaErrorCode("hcaptcha", "challenge-closed")).toMatchObject({
			type: "invalid_token",
		});
		expect(mapCaptchaErrorCode("turnstile")).toEqual({
			type: "unknown",
			message: "验证码验证失败",
			retryable: true,
		});
	});
});
