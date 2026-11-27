import { getDb } from "../db";
import { pruneStatusChecks, recordStatusCheck } from "./status-repo";

/**
 * 状态采集器：每分钟探测一次数据库，把结果写入 status_checks。
 * 进程内只启动一次；采集失败（数据库不可用）时无法落库，只打日志。
 */
const INTERVAL_MS = 60_000;
const PRUNE_INTERVAL_MS = 3_600_000;

let started = false;

async function probeOnce(): Promise<void> {
	const startedAt = Date.now();
	try {
		const { db, t } = await getDb();
		await db.select({ id: t.admins.id }).from(t.admins).limit(1);
		await recordStatusCheck(true, Date.now() - startedAt);
	} catch (err) {
		console.error("[status-monitor] probe failed", err);
		try {
			await recordStatusCheck(false, 0);
		} catch {
			// 数据库本身不可用时无法写入，属预期
		}
	}
}

export function startStatusMonitor(): void {
	if (started) return;
	started = true;

	// 启动即采一次，避免新部署后要等一分钟才有数据
	void probeOnce();

	const timer = setInterval(() => {
		void probeOnce();
	}, INTERVAL_MS);
	timer.unref?.();

	const pruneTimer = setInterval(() => {
		void pruneStatusChecks(7).catch((err) => {
			console.error("[status-monitor] prune failed", err);
		});
	}, PRUNE_INTERVAL_MS);
	pruneTimer.unref?.();
}
