import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiApp } from "../app";
import { initTestDb } from "../db/testing";
import { createSession } from "../services/session";

let cookie = "";
let dir = "";
let postsDir = "";

function writePost(slug: string, title: string, body = "正文内容"): void {
	fs.writeFileSync(
		path.join(postsDir, `${slug}.md`),
		`---\ntitle: ${title}\npublished: 2024-01-01\n---\n\n${body}`,
	);
}

beforeEach(async () => {
	dir = fs.mkdtempSync(path.join(os.tmpdir(), "fuwari-ai-"));
	postsDir = fs.mkdtempSync(path.join(os.tmpdir(), "fuwari-posts-"));
	process.env.AI_SUMMARIES_DIR = dir;
	process.env.POSTS_DIR = postsDir;
	await initTestDb();
	cookie = `fuwari_session=${await createSession("admin")}`;
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
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

	it("regenerates summary and writes cache", async () => {
		writePost("hello", "Hello");
		vi.stubEnv("OPENROUTER_API_KEY", "test-key");
		const fetchMock = vi.fn(
			async () =>
				new Response(
					JSON.stringify({ choices: [{ message: { content: "这是摘要" } }] }),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				),
		);
		vi.stubGlobal("fetch", fetchMock);

		const res = await apiApp.request("/api/admin/ai-summary/hello", {
			method: "POST",
			headers: { cookie },
		});
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.ok).toBe(true);
		expect(body.data.summary).toBe("这是摘要");
		expect(body.data.title).toBe("Hello");

		const written = JSON.parse(
			fs.readFileSync(path.join(dir, "hello.json"), "utf-8"),
		);
		expect(written.summary).toBe("这是摘要");
		expect(written.contentHash).toHaveLength(64);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("returns 404 when post does not exist", async () => {
		vi.stubEnv("OPENROUTER_API_KEY", "test-key");
		const res = await apiApp.request("/api/admin/ai-summary/missing", {
			method: "POST",
			headers: { cookie },
		});
		expect(res.status).toBe(404);
		expect((await res.json()).error.code).toBe("not_found");
	});

	it("returns 400 when api key is missing", async () => {
		writePost("hello", "Hello");
		vi.stubEnv("OPENROUTER_API_KEY", "");
		const res = await apiApp.request("/api/admin/ai-summary/hello", {
			method: "POST",
			headers: { cookie },
		});
		expect(res.status).toBe(400);
		expect((await res.json()).error.code).toBe("missing_api_key");
	});

	it("returns 502 when provider fails", async () => {
		writePost("hello", "Hello");
		vi.stubEnv("OPENROUTER_API_KEY", "test-key");
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response("upstream boom", { status: 500 })),
		);
		const res = await apiApp.request("/api/admin/ai-summary/hello", {
			method: "POST",
			headers: { cookie },
		});
		expect(res.status).toBe(502);
		expect((await res.json()).error.code).toBe("provider_error");
	});

	it("does not write cache when provider returns empty content", async () => {
		writePost("hello", "Hello");
		vi.stubEnv("OPENROUTER_API_KEY", "test-key");
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(JSON.stringify({ choices: [{ message: { content: null } }] }), {
						status: 200,
						headers: { "Content-Type": "application/json" },
					}),
			),
		);
		const res = await apiApp.request("/api/admin/ai-summary/hello", {
			method: "POST",
			headers: { cookie },
		});
		expect(res.status).toBe(502);
		expect((await res.json()).error.code).toBe("provider_error");
		expect(fs.existsSync(path.join(dir, "hello.json"))).toBe(false);
	});

	it("rejects invalid slug on POST and DELETE", async () => {
		const post = await apiApp.request("/api/admin/ai-summary/Bad_Slug", {
			method: "POST",
			headers: { cookie },
		});
		expect(post.status).toBe(400);

		const del = await apiApp.request("/api/admin/ai-summary/Bad_Slug", {
			method: "DELETE",
			headers: { cookie },
		});
		expect(del.status).toBe(400);
	});
});
