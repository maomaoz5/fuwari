import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { validateSlug } from "./security";

// 文章目录路径
const POSTS_DIR = path.join(process.cwd(), "src", "content", "posts");

export interface PostFrontmatter {
	title: string;
	published: string | Date;
	description?: string;
	tags?: string[];
	category?: string;
	draft?: boolean;
	cover?: string;
	lang?: string;
}

export interface PostMeta {
	slug: string;
	title: string;
	published: string;
	description: string;
	tags: string[];
	category: string;
	draft: boolean;
}

export interface PostDetail extends PostMeta {
	content: string; // Markdown body
}

function parsePostMeta(slug: string, data: Record<string, unknown>): PostMeta {
	const published =
		data.published instanceof Date
			? data.published.toISOString().slice(0, 10)
			: String(data.published ?? "");

	return {
		slug,
		title: (data.title as string) ?? "",
		published,
		description: (data.description as string) ?? "",
		tags: Array.isArray(data.tags) ? data.tags : [],
		category: (data.category as string) ?? "",
		draft: (data.draft as boolean) ?? false,
	};
}

// 列出所有文章（仅 frontmatter，不含正文）
export function listPosts(): PostMeta[] {
	if (!fs.existsSync(POSTS_DIR)) return [];

	const files = fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith(".md"));
	const posts: PostMeta[] = [];

	for (const file of files) {
		const slug = file.replace(/\.md$/, "");
		const filePath = path.join(POSTS_DIR, file);
		const raw = fs.readFileSync(filePath, "utf-8");
		const { data } = matter(raw);
		posts.push(parsePostMeta(slug, data));
	}

	// 按 published 日期倒序
	posts.sort((a, b) => (b.published > a.published ? 1 : -1));
	return posts;
}

// 读取单篇文章完整内容
export function readPost(slug: string): PostDetail | null {
	if (!validateSlug(slug)) {
		throw new Error("Invalid slug format");
	}
	const filePath = path.join(POSTS_DIR, `${slug}.md`);
	if (!fs.existsSync(filePath)) return null;

	const raw = fs.readFileSync(filePath, "utf-8");
	const { data, content } = matter(raw);
	const meta = parsePostMeta(slug, data);

	return { ...meta, content };
}

// 创建新文章
export function createPost(
	slug: string,
	frontmatter: PostFrontmatter,
	content: string,
): void {
	if (!validateSlug(slug)) {
		throw new Error("Invalid slug format");
	}
	const filePath = path.join(POSTS_DIR, `${slug}.md`);
	if (fs.existsSync(filePath)) {
		throw new Error(`Post with slug "${slug}" already exists`);
	}
	writePost(slug, frontmatter, content);
}

// 更新文章（覆盖已有文件）
export function writePost(
	slug: string,
	frontmatter: PostFrontmatter,
	content: string,
): void {
	if (!validateSlug(slug)) {
		throw new Error("Invalid slug format");
	}
	const filePath = path.join(POSTS_DIR, `${slug}.md`);
	const fmData: Record<string, unknown> = { ...frontmatter };

	// 确保 published 是日期格式字符串
	if (fmData.published instanceof Date) {
		fmData.published = fmData.published.toISOString().slice(0, 10);
	}

	const output = matter.stringify(content, fmData);
	fs.writeFileSync(filePath, output, "utf-8");
}

// 删除文章
export function deletePost(slug: string): boolean {
	if (!validateSlug(slug)) {
		throw new Error("Invalid slug format");
	}
	const filePath = path.join(POSTS_DIR, `${slug}.md`);
	if (!fs.existsSync(filePath)) return false;
	fs.unlinkSync(filePath);
	return true;
}
