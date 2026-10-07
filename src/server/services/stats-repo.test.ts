import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { ensureSchema, getDb, setDb } from "../db";
import * as schema from "../db/schema-sqlite";
import { getStats, recordArticleView, recordVisit } from "./stats-repo";

function daysAgo(n: number): string {
	return new Date(Date.now() - n * 86_400_000)
		.toISOString()
		.replace("T", " ")
		.slice(0, 19);
}

describe("stats repo", () => {
	beforeEach(async () => {
		const sqlite = new Database(":memory:");
		const db = drizzle(sqlite, { schema });
		await ensureSchema(db);
		setDb(db);
	});

	it("records and counts visits", async () => {
		await recordVisit("/");
		await recordVisit("/about");
		await recordArticleView("hello-world");
		const stats = await getStats("all");
		expect(stats.totalPageViews).toBe(2);
		expect(stats.totalArticleViews).toBe(1);
		expect(stats.topArticles).toEqual([{ slug: "hello-world", count: 1 }]);
	});

	it("range filters exclude old rows", async () => {
		const { db, t } = await getDb();
		await db.insert(t.pageViews).values([
			{ path: "/old", visitedAt: daysAgo(20) },
			{ path: "/new", visitedAt: daysAgo(1) },
		]);
		await db.insert(t.articleViews).values([
			{ slug: "old-post", visitedAt: daysAgo(20) },
			{ slug: "new-post", visitedAt: daysAgo(1) },
			{ slug: "new-post", visitedAt: daysAgo(2) },
		]);

		const week = await getStats("7d");
		expect(week.totalPageViews).toBe(1);
		expect(week.totalArticleViews).toBe(2);

		const month = await getStats("30d");
		expect(month.totalPageViews).toBe(2);
		expect(month.totalArticleViews).toBe(3);

		const all = await getStats("all");
		expect(all.totalPageViews).toBe(2);
	});

	it("dailyViews merges page+article counts by date", async () => {
		const { db, t } = await getDb();
		const today = daysAgo(0);
		await db.insert(t.pageViews).values([
			{ path: "/a", visitedAt: today },
			{ path: "/b", visitedAt: today },
		]);
		await db.insert(t.articleViews).values({ slug: "s", visitedAt: today });
		const stats = await getStats("7d");
		const todayEntry = stats.dailyViews.find((d) => d.count === 3);
		expect(todayEntry).toBeTruthy();
		expect(todayEntry?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});
});
