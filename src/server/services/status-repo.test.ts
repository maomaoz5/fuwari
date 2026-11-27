import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../db";
import { initTestDb } from "../db/testing";
import {
	getStatusHistory,
	pruneStatusChecks,
	recordStatusCheck,
} from "./status-repo";

describe("status-repo", () => {
	beforeEach(async () => {
		await initTestDb();
	});

	it("记录采集并按小时聚合", async () => {
		await recordStatusCheck(true, 10);
		await recordStatusCheck(true, 20);
		await recordStatusCheck(false, 0);

		const buckets = await getStatusHistory(24);
		expect(buckets.length).toBe(1);
		expect(buckets[0].total).toBe(3);
		expect(buckets[0].ok).toBe(2);
		expect(buckets[0].avgMs).toBeGreaterThan(0);
	});

	it("小时内多条记录合并到同一个桶", async () => {
		const { db, t } = await getDb();
		const now = new Date();
		const stamp = (mins: number) => {
			const d = new Date(now.getTime() - mins * 60_000);
			const p = (v: number) => String(v).padStart(2, "0");
			return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:00`;
		};

		await db.insert(t.statusChecks).values([
			{ checkedAt: stamp(50), dbOk: 1, dbMs: 8 },
			{ checkedAt: stamp(40), dbOk: 1, dbMs: 12 },
		]);

		const buckets = await getStatusHistory(24);
		const totalSamples = buckets.reduce((n, b) => n + b.total, 0);
		expect(totalSamples).toBe(2);
	});

	it("清理过期记录", async () => {
		const { db, t } = await getDb();
		await db
			.insert(t.statusChecks)
			.values({ checkedAt: "2020-01-01 00:00:00", dbOk: 1, dbMs: 5 });
		await recordStatusCheck(true, 9);

		await pruneStatusChecks(7);

		const buckets = await getStatusHistory(24 * 365 * 10);
		const total = buckets.reduce((n, b) => n + b.total, 0);
		expect(total).toBe(1);
	});
});
