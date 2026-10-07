import { beforeEach, describe, expect, it } from "vitest";
import { apiApp } from "../app";
import { initTestDb } from "../db/testing";
import { createSession } from "../services/session";

let cookie = "";

beforeEach(async () => {
	await initTestDb();
	cookie = `fuwari_session=${await createSession("admin")}`;
});

const IP = { "x-forwarded-for": "7.7.7.7", "Content-Type": "application/json" };

describe("admin stats", () => {
	it("requires auth", async () => {
		expect((await apiApp.request("/api/admin/stats")).status).toBe(401);
	});

	it("returns stats with default/valid/invalid range", async () => {
		for (const range of [
			"",
			"?range=7d",
			"?range=30d",
			"?range=all",
			"?range=bogus",
		]) {
			const res = await apiApp.request(`/api/admin/stats${range}`, {
				headers: { cookie },
			});
			expect(res.status).toBe(200);
			const data = (await res.json()).data;
			expect(data).toHaveProperty("totalPageViews");
			expect(data).toHaveProperty("dailyViews");
			expect(data).toHaveProperty("topArticles");
		}
	});
});

describe("public stats record", () => {
	it("records article views (two rows) and page views", async () => {
		const res = await apiApp.request("/api/stats/record", {
			method: "POST",
			headers: IP,
			body: JSON.stringify({ type: "article", slug: "hello-world" }),
		});
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ success: true });

		await apiApp.request("/api/stats/record", {
			method: "POST",
			headers: { ...IP, "x-forwarded-for": "6.6.6.6" },
			body: JSON.stringify({ type: "page", path: "/about" }),
		});

		const stats = (
			await (
				await apiApp.request("/api/admin/stats?range=all", {
					headers: { cookie },
				})
			).json()
		).data;
		expect(stats.totalPageViews).toBe(2);
		expect(stats.totalArticleViews).toBe(1);
	});

	it("tolerates trailing slash (blog frontend calls /api/stats/record/)", async () => {
		const res = await apiApp.request("/api/stats/record/", {
			method: "POST",
			headers: { ...IP, "x-forwarded-for": "5.5.5.5" },
			body: JSON.stringify({ type: "page", path: "/" }),
		});
		expect(res.status).toBe(200);
	});

	it("rate limits after 60 requests per IP", async () => {
		for (let i = 0; i < 60; i++) {
			const res = await apiApp.request("/api/stats/record", {
				method: "POST",
				headers: IP,
				body: JSON.stringify({ type: "page", path: "/" }),
			});
			expect(res.status).toBe(200);
		}
		const blocked = await apiApp.request("/api/stats/record", {
			method: "POST",
			headers: IP,
			body: JSON.stringify({ type: "page", path: "/" }),
		});
		expect(blocked.status).toBe(429);
	});
});
