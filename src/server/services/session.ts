import { createHash, randomUUID } from "node:crypto";
import { eq, lt } from "drizzle-orm";
import type { Context } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import { getDb } from "../db";
import { SESSION_TTL_MS } from "./security";

const SESSION_COOKIE_NAME = "fuwari_session";

function sha256(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

export async function createSession(
	username: string,
	ip?: string,
	userAgent?: string,
): Promise<string> {
	const token = randomUUID();
	const now = new Date();
	const expires = new Date(now.getTime() + SESSION_TTL_MS);
	const { db, t } = await getDb();

	await db
		.delete(t.sessions)
		.where(lt(t.sessions.expiresAt, now.toISOString()));
	await db.insert(t.sessions).values({
		tokenHash: sha256(token),
		username,
		createdAt: now.toISOString(),
		expiresAt: expires.toISOString(),
		ip: ip ?? null,
		userAgent: userAgent ?? null,
	});
	return token;
}

export async function validateSession(token: string): Promise<string | null> {
	const { db, t } = await getDb();
	const rows = await db
		.select()
		.from(t.sessions)
		.where(eq(t.sessions.tokenHash, sha256(token)))
		.limit(1);
	const row = rows[0];
	if (!row) return null;
	if (Date.parse(row.expiresAt) <= Date.now()) {
		await db.delete(t.sessions).where(eq(t.sessions.tokenHash, sha256(token)));
		return null;
	}
	return row.username;
}

export async function revokeSession(token: string): Promise<void> {
	const { db, t } = await getDb();
	await db.delete(t.sessions).where(eq(t.sessions.tokenHash, sha256(token)));
}

export function setSessionCookie(c: Context, token: string): void {
	setCookie(c, SESSION_COOKIE_NAME, token, {
		httpOnly: true,
		sameSite: "Strict",
		path: "/",
		maxAge: 86400,
		secure: !import.meta.env?.DEV,
	});
}

export function clearSessionCookie(c: Context): void {
	deleteCookie(c, SESSION_COOKIE_NAME, {
		httpOnly: true,
		sameSite: "Strict",
		path: "/",
		maxAge: 0,
		secure: !import.meta.env?.DEV,
	});
}

export function getTokenFromRequest(req: Request): string | null {
	const cookieHeader = req.headers.get("cookie");
	if (cookieHeader) {
		const match = cookieHeader.match(
			new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`),
		);
		if (match) return match[1];
	}
	const authHeader = req.headers.get("Authorization");
	if (authHeader?.startsWith("Bearer ")) return authHeader.substring(7);
	return null;
}

export function getClientIp(req: Request): string {
	return (
		req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
		req.headers.get("x-real-ip") ||
		"unknown"
	);
}
