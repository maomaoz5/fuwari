import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { apiApp } from "../app";
import { initTestDb } from "../db/testing";
import { createSession } from "../services/session";

let cookie = "";

beforeEach(async () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fuwari-posts-"));
	process.env.POSTS_DIR = dir;
	await initTestDb();
	const token = await createSession("admin");
	cookie = `fuwari_session=${token}`;
});

function auth(headers: Record<string, string> = {}): Record<string, string> {
	return { cookie, ...headers };
}

describe("posts routes", () => {
	it("requires auth", async () => {
		const res = await apiApp.request("/api/admin/posts");
		expect(res.status).toBe(401);
	});

	it("lists posts", async () => {
		const res = await apiApp.request("/api/admin/posts", { headers: auth() });
		expect(res.status).toBe(200);
		expect((await res.json()).data).toEqual([]);
	});

	it("creates, reads, updates, deletes", async () => {
		const create = await apiApp.request("/api/admin/posts", {
			method: "POST",
			headers: auth({ "Content-Type": "application/json" }),
			body: JSON.stringify({
				slug: "hello",
				title: "Hello",
				content: "# hi",
				frontmatter: { published: "2026-10-07", tags: ["x"] },
			}),
		});
		expect(create.status).toBe(201);

		const dup = await apiApp.request("/api/admin/posts", {
			method: "POST",
			headers: auth({ "Content-Type": "application/json" }),
			body: JSON.stringify({ slug: "hello", title: "Hello", content: "" }),
		});
		expect(dup.status).toBe(409);

		const get = await apiApp.request("/api/admin/posts/hello", {
			headers: auth(),
		});
		expect((await get.json()).data.title).toBe("Hello");

		const put = await apiApp.request("/api/admin/posts/hello", {
			method: "PUT",
			headers: auth({ "Content-Type": "application/json" }),
			body: JSON.stringify({
				content: "updated",
				frontmatter: { title: "Hello2", published: "2026-10-07" },
			}),
		});
		expect(put.status).toBe(200);

		const del = await apiApp.request("/api/admin/posts/hello", {
			method: "DELETE",
			headers: auth(),
		});
		expect(del.status).toBe(200);
		expect(
			(await apiApp.request("/api/admin/posts/hello", { headers: auth() }))
				.status,
		).toBe(404);
	});

	it("rejects invalid slug", async () => {
		const res = await apiApp.request("/api/admin/posts/Bad_Slug", {
			headers: auth(),
		});
		expect(res.status).toBe(400);
	});

	it("rejects missing fields", async () => {
		const res = await apiApp.request("/api/admin/posts", {
			method: "POST",
			headers: auth({ "Content-Type": "application/json" }),
			body: JSON.stringify({ slug: "ok-slug" }),
		});
		expect(res.status).toBe(400);
	});
});
