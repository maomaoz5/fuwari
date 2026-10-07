import { beforeEach, describe, expect, it } from "vitest";
import { initTestDb } from "../db/testing";
import { apiApp } from "../app";
import { storeResetToken } from "../services/admins-repo";

const IP = { "x-forwarded-for": "9.9.9.9" };

beforeEach(async () => {
	await initTestDb();
});

function jsonInit(
	body: unknown,
	headers: Record<string, string> = {},
): RequestInit {
	return {
		method: "POST",
		headers: { "Content-Type": "application/json", ...headers },
		body: JSON.stringify(body),
	};
}

describe("login", () => {
	it("rejects wrong credentials with 401 envelope and clears cookie", async () => {
		const res = await apiApp.request(
			"/api/admin/auth",
			jsonInit({ username: "admin", password: "wrongpassword1" }, IP),
		);
		expect(res.status).toBe(401);
		const body = await res.json();
		expect(body.ok).toBe(false);
		expect(body.error.message).toBe("用户名或密码错误");
		expect(res.headers.get("set-cookie")).toContain("fuwari_session=;");
	});

	it("logs in, sets cookie, me works, logout clears", async () => {
		const res = await apiApp.request(
			"/api/admin/auth",
			jsonInit({ username: "admin", password: "admin12345678" }, IP),
		);
		expect(res.status).toBe(200);
		expect((await res.json()).data.username).toBe("admin");
		const cookie = res.headers.get("set-cookie")!;
		expect(cookie).toContain("fuwari_session=");
		expect(cookie).toContain("HttpOnly");

		const me = await apiApp.request("/api/admin/me", { headers: { cookie } });
		expect(me.status).toBe(200);
		expect((await me.json()).data.username).toBe("admin");

		const logout = await apiApp.request("/api/admin/logout", {
			method: "POST",
			headers: { cookie },
		});
		expect(logout.status).toBe(200);
		const meAfter = await apiApp.request("/api/admin/me", {
			headers: { cookie },
		});
		expect(meAfter.status).toBe(401);
	});

	it("requires username and password", async () => {
		const res = await apiApp.request(
			"/api/admin/auth",
			jsonInit({ username: "" }, IP),
		);
		expect(res.status).toBe(400);
	});

	it("rate limits after 10 attempts per IP", async () => {
		for (let i = 0; i < 10; i++) {
			await apiApp.request(
				"/api/admin/auth",
				jsonInit({ username: "admin", password: "wrongpassword1" }, IP),
			);
		}
		const res = await apiApp.request(
			"/api/admin/auth",
			jsonInit({ username: "admin", password: "admin12345678" }, IP),
		);
		expect(res.status).toBe(429);
		expect((await res.json()).error.retryAfter).toBeGreaterThan(0);
	});
});

describe("me without auth", () => {
	it("returns 401", async () => {
		const res = await apiApp.request("/api/admin/me");
		expect(res.status).toBe(401);
	});
});

describe("captcha-config", () => {
	it("returns disabled info (provider none in tests)", async () => {
		const res = await apiApp.request("/api/admin/captcha-config");
		expect(res.status).toBe(200);
		expect((await res.json()).data).toEqual({
			enabled: false,
			provider: "none",
			siteKey: "",
		});
	});
});

describe("forgot-password", () => {
	it("returns same message regardless of user existence", async () => {
		const existing = await apiApp.request(
			"/api/admin/auth/forgot-password",
			jsonInit({ username: "admin" }, IP),
		);
		const missing = await apiApp.request(
			"/api/admin/auth/forgot-password",
			jsonInit({ username: "ghost" }, IP),
		);
		expect(existing.status).toBe(200);
		expect(missing.status).toBe(200);
		expect((await existing.json()).data.message).toBe(
			(await missing.json()).data.message,
		);
	});

	it("rate limits after 3 attempts", async () => {
		for (let i = 0; i < 3; i++) {
			await apiApp.request(
				"/api/admin/auth/forgot-password",
				jsonInit({ username: "admin" }, IP),
			);
		}
		const res = await apiApp.request(
			"/api/admin/auth/forgot-password",
			jsonInit({ username: "admin" }, IP),
		);
		expect(res.status).toBe(429);
	});
});

describe("reset-password", () => {
	it("consumes valid token and changes password", async () => {
		await storeResetToken("admin", "tok123", new Date(Date.now() + 30 * 60 * 1000));
		const res = await apiApp.request(
			"/api/admin/auth/reset-password",
			jsonInit({ token: "tok123", newPassword: "newpassword123" }),
		);
		expect(res.status).toBe(200);

		const login = await apiApp.request(
			"/api/admin/auth",
			jsonInit(
				{ username: "admin", password: "newpassword123" },
				{ "x-forwarded-for": "8.8.8.8" },
			),
		);
		expect(login.status).toBe(200);
	});

	it("rejects expired/invalid token", async () => {
		const res = await apiApp.request(
			"/api/admin/auth/reset-password",
			jsonInit({ token: "nope", newPassword: "newpassword123" }),
		);
		expect(res.status).toBe(400);
	});

	it("rejects weak password", async () => {
		await storeResetToken("admin", "tok456", new Date(Date.now() + 30 * 60 * 1000));
		const res = await apiApp.request(
			"/api/admin/auth/reset-password",
			jsonInit({ token: "tok456", newPassword: "short" }),
		);
		expect(res.status).toBe(400);
	});
});
