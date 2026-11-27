import { sql } from "drizzle-orm";
import { getDb, getDialect } from "../db";

export type StatusBucket = {
	/** 小时桶，形如 2026-11-28T00:00:00 */
	bucket: string;
	/** 该小时内采集次数 */
	total: number;
	/** 其中数据库可用的次数 */
	ok: number;
	/** 该小时平均耗时（ms） */
	avgMs: number;
};

/** 记录一次状态采集 */
export async function recordStatusCheck(
	dbOk: boolean,
	dbMs: number,
): Promise<void> {
	const { db, t } = await getDb();
	await db.insert(t.statusChecks).values({
		dbOk: dbOk ? 1 : 0,
		dbMs: Math.max(0, Math.round(dbMs)),
	});
}

/** 按小时聚合最近 N 小时的状态记录 */
export async function getStatusHistory(
	hours: number,
): Promise<StatusBucket[]> {
	const { db, t } = await getDb();
	const dialect = getDialect();

	// 两种方言的小时截断与时间窗口写法不同
	const bucketExpr =
		dialect === "postgres"
			? sql<string>`to_char(date_trunc('hour', ${t.statusChecks.checkedAt}), 'YYYY-MM-DD"T"HH24:00:00')`
			: sql<string>`strftime('%Y-%m-%dT%H:00:00', ${t.statusChecks.checkedAt})`;

	const cutoff =
		dialect === "postgres"
			? sql`now() - (${hours} * interval '1 hour')`
			: sql`datetime('now', ${`-${hours} hours`})`;

	const rows = await db
		.select({
			bucket: bucketExpr.as("bucket"),
			total: sql<number>`count(*)`.as("total"),
			ok: sql<number>`sum(${t.statusChecks.dbOk})`.as("ok"),
			avgMs: sql<number>`cast(avg(${t.statusChecks.dbMs}) as integer)`.as(
				"avg_ms",
			),
		})
		.from(t.statusChecks)
		.where(sql`${t.statusChecks.checkedAt} >= ${cutoff}`)
		.groupBy(sql`1`)
		.orderBy(sql`1`);

	return rows.map((r) => ({
		bucket: String(r.bucket),
		total: Number(r.total) || 0,
		ok: Number(r.ok) || 0,
		avgMs: Number(r.avgMs) || 0,
	}));
}

/** 清理过期记录，避免表无限增长 */
export async function pruneStatusChecks(keepDays = 7): Promise<void> {
	const { db, t } = await getDb();
	const dialect = getDialect();
	const cutoff =
		dialect === "postgres"
			? sql`now() - (${keepDays} * interval '1 day')`
			: sql`datetime('now', ${`-${keepDays} days`})`;
	await db.delete(t.statusChecks).where(sql`${t.statusChecks.checkedAt} < ${cutoff}`);
}
