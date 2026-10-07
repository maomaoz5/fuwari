import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { apiApp } from "../app";
import { initTestDb } from "../db/testing";
import { createSession } from "../services/session";

let cookie = "";
let overridesPath = "";

beforeEach(async () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fuwari-cfg-"));
	overridesPath = path.join(dir, "overrides.json");
	process.env.CONFIG_OVERRIDES_PATH = overridesPath;
	await initTestDb();
	cookie = `fuwari_session=${await createSession("admin")}`;
});

describe("config routes", () => {
	it("requires auth", async () => {
		expect((await apiApp.request("/api/admin/config")).status).toBe(401);
	});

	it("GET returns merged config object", async () => {
		const res = await apiApp.request("/api/admin/config", {
			headers: { cookie },
		});
		expect(res.status).toBe(200);
		const data = (await res.json()).data;
		expect(typeof data).toBe("object");
	});

	it("PUT accepts whitelisted keys and persists overrides", async () => {
		const res = await apiApp.request("/api/admin/config", {
			method: "PUT",
			headers: { cookie, "Content-Type": "application/json" },
			body: JSON.stringify({
				site: { title: "测试站" },
				captcha: { provider: "none" },
			}),
		});
		expect(res.status).toBe(200);
		const saved = JSON.parse(fs.readFileSync(overridesPath, "utf-8"));
		expect(saved.site.title).toBe("测试站");
	});

	it("PUT rejects unknown keys", async () => {
		const res = await apiApp.request("/api/admin/config", {
			method: "PUT",
			headers: { cookie, "Content-Type": "application/json" },
			body: JSON.stringify({ evil: {} }),
		});
		expect(res.status).toBe(400);
	});
});
