/**
 * 构建前生成 / 更新两个站点元文件：
 *   1. public/llms.txt                —— 给 AI 爬虫读的站点摘要 + 文章索引
 *   2. public/.well-known/security.txt —— 安全联系方式（RFC 9116，Expires 必填）
 *
 * 为什么用脚本而不是手写：
 *   llms.txt 必须随文章增删而变化，手写必然过时；
 *   security.txt 的 Expires 过期即失效，需要每次构建自动顺延一年。
 *
 * 由 package.json 的 build 脚本在 astro build 之前调用。
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const POSTS_DIR = path.join(ROOT, "src/content/posts");
const PUBLIC_DIR = path.join(ROOT, "public");

const SITE = "https://zidayo.com";
const TITLE = "猫猫的blog";
const TAGLINE = "记录生活与代码的日常";
const CONTACT = "mailto:postmaster@maomaoz.org";

function parseFrontmatter(raw) {
	const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!m) return {};
	const out = {};
	for (const line of m[1].split(/\r?\n/)) {
		const kv = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
		if (!kv) continue;
		const key = kv[1];
		let value = kv[2].trim();
		if (/^["'].*["']$/.test(value)) value = value.slice(1, -1);
		out[key] = value;
	}
	return out;
}

function loadPosts() {
	if (!fs.existsSync(POSTS_DIR)) return [];
	const posts = [];
	for (const file of fs.readdirSync(POSTS_DIR)) {
		if (!/\.mdx?$/.test(file)) continue;
		const raw = fs.readFileSync(path.join(POSTS_DIR, file), "utf8");
		const fm = parseFrontmatter(raw);
		if (String(fm.draft).toLowerCase() === "true") continue;
		const slug = file.replace(/\.mdx?$/, "");
		posts.push({
			slug,
			title: fm.title || slug,
			date: fm.published || "",
			description: fm.description || "",
			category: fm.category || "",
		});
	}
	// 按发布日期倒序，无日期的排最后
	return posts.sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function buildLlmsTxt(posts) {
	const lines = [
		`# ${TITLE}`,
		"",
		`> ${TAGLINE}`,
		"",
		"## 关于",
		"",
		"- 个人技术博客，主要记录编程实践、部署运维与日常折腾",
		"- 技术栈：Astro 构建，HAProxy + Caddy 承载，PostgreSQL 存储",
		`- 站点地址：${SITE}`,
		"- 内容以中文为主，代码与技术细节尽量保持可复现",
		"",
	];

	if (posts.length > 0) {
		lines.push("## 文章", "");
		for (const p of posts) {
			const meta = [p.date, p.category].filter(Boolean).join(" · ");
			const desc = p.description ? `：${p.description}` : "";
			lines.push(`- [${p.title}](${SITE}/posts/${p.slug}/)${meta ? `（${meta}）` : ""}${desc}`);
		}
		lines.push("");
	}

	lines.push(
		"## 链接",
		"",
		`- [首页](${SITE}/)`,
		`- [归档](${SITE}/archive/)`,
		`- [关于](${SITE}/about/)`,
		`- [RSS](${SITE}/rss.xml)`,
		"",
	);

	return lines.join("\n");
}

function buildSecurityTxt() {
	// RFC 9116 要求 Expires，且必须是未来时间；这里每次构建顺延一年，避免过期失效
	const expires = new Date();
	expires.setUTCFullYear(expires.getUTCFullYear() + 1);
	expires.setUTCHours(0, 0, 0, 0);
	return [
		`Contact: ${CONTACT}`,
		`Expires: ${expires.toISOString()}`,
		"Preferred-Languages: zh, en",
		`Canonical: ${SITE}/.well-known/security.txt`,
		`Policy: ${SITE}/about/`,
		"",
	].join("\n");
}

const posts = loadPosts();

const llmsPath = path.join(PUBLIC_DIR, "llms.txt");
fs.writeFileSync(llmsPath, buildLlmsTxt(posts), "utf8");
console.log(`[site-meta] llms.txt 已生成（${posts.length} 篇文章）`);

const wkDir = path.join(PUBLIC_DIR, ".well-known");
fs.mkdirSync(wkDir, { recursive: true });
const secPath = path.join(wkDir, "security.txt");
fs.writeFileSync(secPath, buildSecurityTxt(), "utf8");
console.log("[site-meta] security.txt 已更新（Expires 顺延一年）");
