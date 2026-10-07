import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
	createPost,
	deletePost,
	listPosts,
	readPost,
	writePost,
} from "./post-files";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fuwari-posts-"));

beforeAll(() => {
	process.env.POSTS_DIR = dir;
});

describe("post files", () => {
	it("create → read → list roundtrip", () => {
		createPost(
			"my-post",
			{ title: "标题", published: "2026-10-07", tags: ["a"] },
			"# hello",
		);
		const post = readPost("my-post");
		expect(post?.title).toBe("标题");
		expect(post?.content.trim()).toBe("# hello");
		expect(post?.tags).toEqual(["a"]);
		expect(listPosts()).toHaveLength(1);
	});

	it("rejects duplicate slug", () => {
		expect(() =>
			createPost("my-post", { title: "x", published: "2026-10-07" }, ""),
		).toThrow(/already exists/);
	});

	it("rejects invalid slug", () => {
		expect(() => readPost("../evil")).toThrow(/Invalid slug/);
	});

	it("write updates content", () => {
		writePost("my-post", { title: "新标题", published: "2026-10-07" }, "updated");
		expect(readPost("my-post")?.content).toBe("updated\n");
	});

	it("delete", () => {
		expect(deletePost("my-post")).toBe(true);
		expect(deletePost("my-post")).toBe(false);
	});
});
