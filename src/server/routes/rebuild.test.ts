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
	dir = fs.mkdtempSync(path.join(os.tmpdir(), "fuwari-rebuild-"));
	process.env.REBUILD_SCRIPT = path.join(dir, "rebuild.sh");
	process.env.REBUILD_LOG = path.join(dir, "rebuild.log");
	process.env.REBUILD_FLAG = path.join(dir, ".rebuilding");
	await initTestDb();
	cookie = `fuwari_session=${await createSession("admin")}`;
});

describe("rebuild routes", () => {
	it("requires auth", async () => {
		expect((await apiApp.request("/api/admin/rebuild", { method: "POST" })).status).toBe(401);
		expect((await apiApp.request("/api/admin/rebuild")).status).toBe(401);
	});

	it("returns 400 when rebuild script is missing", async () => {
		const res = await apiApp.request("/api/admin/rebuild", {
			method: "POST",
			headers: { cookie },
		});
		expect(res.status).toBe(400);
		expect((await res.json()).error.code).toBe("rebuild_unavailable");
	});

	it("returns 409 while another rebuild is running", async () => {
		fs.writeFileSync(process.env.REBUILD_SCRIPT as string, "#!/bin/bash\nexit 0\n");
		fs.writeFileSync(process.env.REBUILD_FLAG as string, "");
		const res = await apiApp.request("/api/admin/rebuild", {
			method: "POST",
			headers: { cookie },
		});
		expect(res.status).toBe(409);
		expect((await res.json()).error.code).toBe("rebuild_running");
	});

	it("reports running state and log tail", async () => {
		fs.writeFileSync(process.env.REBUILD_LOG as string, "=== 重建开始 ===\n同步文章\n");
		fs.writeFileSync(process.env.REBUILD_FLAG as string, "");

		const res = await apiApp.request("/api/admin/rebuild", { headers: { cookie } });
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.running).toBe(true);
		expect(body.data.tail).toContain("同步文章");
	});

	it("reports idle when no flag and no log", async () => {
		const res = await apiApp.request("/api/admin/rebuild", { headers: { cookie } });
		const body = await res.json();
		expect(body.data.running).toBe(false);
		expect(body.data.tail).toBe("");
	});
});
