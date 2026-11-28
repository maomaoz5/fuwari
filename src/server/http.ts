import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { AppEnv } from "./app";

export type { AppEnv };

// 显式标注返回类型：路由链增长后，c.json(...) 的推断类型会携带整条
// Hono 链路的泛型，触发 TS7056（类型超出序列化上限）。
export function ok<T>(
	c: Context,
	data: T,
	status: ContentfulStatusCode = 200,
): Response {
	return c.json({ ok: true, data }, status);
}

export function fail(
	c: Context,
	status: ContentfulStatusCode,
	code: string,
	message: string,
	extra?: Record<string, unknown>,
): Response {
	return c.json(
		{ ok: false, error: { code, message, ...(extra ?? {}) } },
		status,
	);
}
