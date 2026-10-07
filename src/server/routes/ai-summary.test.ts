import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { apiApp } from "../app";
import { initTestDb } from "../db/testing";
import { createSession } from "../services/session";

let cookie = "";
let dir = "";

beforeEach(async () => {
	dir = fs.mkdtempSync(path.join(os.tmpdir(), "fuwari-ai-"));
	process.env.AI_SUMMARIES_DIR = dir;
	await initTestDb();
	cookie = `fuwari_session=${await createSession("admin")}`;
});

describe("ai-summary routes", () => {
	it("requires auth", async () => {
		expect((await apiApp.request("/api/admin/ai-summary")).status).toBe(401);
	});

	it("returns empty list when dir missing", async () => {
		fs.rmSync(dir, { recursive: true });
		const res = await apiApp.request("/api/admin/ai-summary", {
			headers: { cookie },
		});
		expect(res.status).toBe(200);
		expect((await res.json()).data).toEqual([]);
	});

	it("lists, deletes cache files", async () => {
		fs.writeFileSync(path.join(dir, "hello.json"), "{}");
		fs.writeFileSync(path.join(dir, "notes.txt"), "ignored");
		const list = (
			await (
				await apiApp.request("/api/admin/ai-summary", { headers: { cookie } })
			).json()
		).data;
		expect(list).toHaveLength(1);
		expect(list[0].slug).toBe("hello");
		expect(list[0].size).toBeGreaterThan(0);
		expect(typeof list[0].modifiedAt).toBe("string");

		const del = await apiApp.request("/api/admin/ai-summary/hello", {
			method: "DELETE",
			headers: { cookie },
		});
		expect(del.status).toBe(200);
		const missing = await apiApp.request("/api/admin/ai-summary/hello", {
			method: "DELETE",
			headers: { cookie },
		});
		expect(missing.status).toBe(404);
	});

	it("POST is 501 not implemented", async () => {
		const res = await apiApp.request("/api/admin/ai-summary/hello", {
			method: "POST",
			headers: { cookie },
		});
		expect(res.status).toBe(501);
	});

	it("rejects invalid slug", async () => {
		const res = await apiApp.request("/api/admin/ai-summary/Bad_Slug", {
			method: "DELETE",
			headers: { cookie },
		});
		expect(res.status).toBe(400);
	});
});
