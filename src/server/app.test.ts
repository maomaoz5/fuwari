import { beforeEach, describe, expect, it } from "vitest";
import { apiApp } from "./app";
import { initTestDb } from "./db/testing";

beforeEach(async () => {
	await initTestDb();
});

describe("hono app spike", () => {
	it("delegates /api/__health with and without trailing slash", async () => {
		const res1 = await apiApp.request("/api/__health");
		expect(res1.status).toBe(200);
		expect(await res1.json()).toEqual({ ok: true, data: { status: "up" } });

		const res2 = await apiApp.request("/api/__health/");
		expect(res2.status).toBe(200);
	});

	it("reports readiness with a live database", async () => {
		const res = await apiApp.request("/api/__ready");
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.ok).toBe(true);
		expect(body.data.status).toBe("ready");
		expect(body.data.db).toBe("up");
		expect(typeof body.data.latencyMs).toBe("number");
	});

	it("returns 404 envelope for unknown api paths", async () => {
		const res = await apiApp.request("/api/nope");
		expect(res.status).toBe(404);
		expect(await res.json()).toEqual({
			ok: false,
			error: { code: "not_found", message: "Not Found" },
		});
	});
});
