import type { Context } from "hono";
import type { AppEnv } from "./app";

export type { AppEnv };

export function ok<T>(c: Context, data: T, status = 200) {
	return c.json({ ok: true, data }, status);
}

export function fail(
	c: Context,
	status: number,
	code: string,
	message: string,
	extra?: Record<string, unknown>,
) {
	return c.json({ ok: false, error: { code, message, ...(extra ?? {}) } }, status);
}
