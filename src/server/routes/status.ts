import { Hono } from "hono";
import type { AppEnv } from "../http";
import { ok as okJson } from "../http";
import { getStatusHistory } from "../services/status-repo";

export const statusRoutes = new Hono<AppEnv>();

/** 公开接口：最近 N 小时的状态历史（按小时聚合） */
statusRoutes.get("/status-history", async (c) => {
	const raw = Number(c.req.query("hours") ?? "24");
	const hours = Number.isFinite(raw)
		? Math.min(168, Math.max(1, Math.floor(raw)))
		: 24;

	const buckets = await getStatusHistory(hours);

	let samples = 0;
	let okCount = 0;
	let msWeighted = 0;
	let msSamples = 0;

	for (const b of buckets) {
		samples += b.total;
		okCount += b.ok;
		if (b.avgMs > 0 && b.total > 0) {
			msWeighted += b.avgMs * b.total;
			msSamples += b.total;
		}
	}

	return okJson(c, {
		hours,
		buckets,
		samples,
		uptime: samples > 0 ? okCount / samples : null,
		avgMs: msSamples > 0 ? Math.round(msWeighted / msSamples) : null,
	});
});
