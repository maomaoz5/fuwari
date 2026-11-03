import { spawn } from "node:child_process";
import fs from "node:fs";
import { Hono } from "hono";
import type { AppEnv } from "../http";
import { fail, ok } from "../http";
import { requireAuth } from "../middleware/auth";
import { checkRateLimit } from "../services/rate-limit";
import { RATE_LIMIT_WINDOW_MS } from "../services/security";

/**
 * 按需重建：文章页是预渲染的，后台改完 md 必须重新构建才会上线。
 * 这里触发服务器上的重建脚本（同步文章 → pnpm build → 原子替换 dist → 重启）。
 */

const REBUILD_MAX_PER_WINDOW = 3;
const LOG_TAIL_BYTES = 4096;

function scriptPath(): string {
	return process.env.REBUILD_SCRIPT || "/root/fuwari-build/rebuild.sh";
}

function logPath(): string {
	return process.env.REBUILD_LOG || "/root/fuwari-build/rebuild.log";
}

function runningFlagPath(): string {
	return process.env.REBUILD_FLAG || "/root/fuwari-build/.rebuilding";
}

function tailLog(): string {
	const file = logPath();
	if (!fs.existsSync(file)) return "";
	try {
		const size = fs.statSync(file).size;
		const start = Math.max(0, size - LOG_TAIL_BYTES);
		const length = size - start;
		if (length <= 0) return "";
		const buf = Buffer.alloc(length);
		const fd = fs.openSync(file, "r");
		try {
			fs.readSync(fd, buf, 0, length, start);
		} finally {
			fs.closeSync(fd);
		}
		return buf.toString("utf-8");
	} catch {
		return "";
	}
}

export const rebuildRoutes = new Hono<AppEnv>();

rebuildRoutes.post("/admin/rebuild", requireAuth, async (c) => {
	const username = c.get("username");
	const rl = await checkRateLimit(
		`rebuild:${username}`,
		REBUILD_MAX_PER_WINDOW,
		RATE_LIMIT_WINDOW_MS,
	);
	if (!rl.allowed) {
		return fail(c, 429, "rate_limited", "重建过于频繁，请稍后再试", {
			retryAfter: rl.retryAfter,
		});
	}

	const script = scriptPath();
	if (!fs.existsSync(script)) {
		return fail(c, 400, "rebuild_unavailable", "服务器未配置重建脚本");
	}
	if (fs.existsSync(runningFlagPath())) {
		return fail(c, 409, "rebuild_running", "已有重建任务在执行");
	}

	// 必须用 setsid 脱离当前进程组：脚本最后会 pm2 restart，
	// 否则重启会把脚本自身一起杀掉，导致收尾日志与清理动作丢失。
	const child = spawn("setsid", ["-f", "bash", script], {
		detached: true,
		stdio: "ignore",
	});
	child.unref();

	return ok(c, { started: true });
});

rebuildRoutes.get("/admin/rebuild", requireAuth, (c) =>
	ok(c, {
		running: fs.existsSync(runningFlagPath()),
		tail: tailLog(),
	}),
);
