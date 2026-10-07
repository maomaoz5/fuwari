import { sql, type SQL } from "drizzle-orm";
import { getDb, getDialect, type Tables } from "../db";

export type StatsRange = "7d" | "30d" | "all";

export type StatsResult = {
	totalPageViews: number;
	totalArticleViews: number;
	dailyViews: { date: string; count: number }[];
	topArticles: { slug: string; count: number }[];
};

function nowSqlDatetime(): string {
	return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function cutoffSqlDatetime(range: StatsRange): string | null {
	if (range === "all") return null;
	const days = range === "7d" ? 7 : 30;
	return new Date(Date.now() - days * 86_400_000)
		.toISOString()
		.replace("T", " ")
		.slice(0, 19);
}

function dayExpr(column: unknown): SQL<string> {
	return getDialect() === "postgres"
		? sql<string>`to_char(${column}, 'YYYY-MM-DD')`
		: sql<string>`date(${column})`;
}

export async function recordVisit(pagePath: string): Promise<void> {
	const { db, t } = await getDb();
	await db
		.insert(t.pageViews)
		.values({ path: pagePath, visitedAt: nowSqlDatetime() });
}

export async function recordArticleView(slug: string): Promise<void> {
	const { db, t } = await getDb();
	await db
		.insert(t.articleViews)
		.values({ slug, visitedAt: nowSqlDatetime() });
}

async function dailyFrom(
	t: Tables,
	table: "pageViews" | "articleViews",
	cutoff: string | null,
): Promise<{ date: string; count: number }[]> {
	const { db } = await getDb();
	const src = table === "pageViews" ? t.pageViews : t.articleViews;
	const col = src.visitedAt;
	const dateExpr = dayExpr(col).as("date");

	const base = db.select({
		date: dateExpr,
		count: sql<number>`count(*)`.as("count"),
	});
	const rows = cutoff
		? await base.from(src).where(sql`${col} >= ${cutoff}`).groupBy(sql`1`)
		: await base.from(src).groupBy(sql`1`);
	return rows.map((r) => ({ date: String(r.date), count: Number(r.count) }));
}

export async function getStats(range: StatsRange): Promise<StatsResult> {
	const { db, t } = await getDb();
	const cutoff = cutoffSqlDatetime(range);

	const pageFilter = cutoff
		? sql`${t.pageViews.visitedAt} >= ${cutoff}`
		: undefined;
	const articleFilter = cutoff
		? sql`${t.articleViews.visitedAt} >= ${cutoff}`
		: undefined;

	const pageCount = await db
		.select({ count: sql<number>`count(*)` })
		.from(t.pageViews)
		.where(pageFilter);
	const articleCount = await db
		.select({ count: sql<number>`count(*)` })
		.from(t.articleViews)
		.where(articleFilter);

	const [dailyPages, dailyArticles] = await Promise.all([
		dailyFrom(t, "pageViews", cutoff),
		dailyFrom(t, "articleViews", cutoff),
	]);

	const merged = new Map<string, number>();
	for (const { date, count } of [...dailyPages, ...dailyArticles]) {
		merged.set(date, (merged.get(date) ?? 0) + count);
	}
	const dailyViews = [...merged.entries()]
		.map(([date, count]) => ({ date, count }))
		.sort((a, b) => (a.date > b.date ? 1 : -1));

	const topArticles = (
		await db
			.select({
				slug: t.articleViews.slug,
				count: sql<number>`count(*)`.as("count"),
			})
			.from(t.articleViews)
			.where(articleFilter)
			.groupBy(t.articleViews.slug)
			.orderBy(sql`count(*) desc`)
			.limit(10)
	).map((r) => ({ slug: r.slug, count: Number(r.count) }));

	return {
		totalPageViews: Number(pageCount[0].count),
		totalArticleViews: Number(articleCount[0].count),
		dailyViews,
		topArticles,
	};
}
