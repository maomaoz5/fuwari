import { eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
	hashPassword,
	validatePasswordStrength,
	verifyPassword,
} from "./security";

export async function ensureDefaultAdmin(): Promise<void> {
	const isDev = typeof import.meta !== "undefined" && import.meta.env?.DEV;
	const allowDefault = isDev || process.env.CREATE_DEFAULT_ADMIN === "true";
	if (!allowDefault) {
		console.warn(
			"[DB] Skipping default admin creation in production. Set CREATE_DEFAULT_ADMIN=true to enable.",
		);
		return;
	}
	const { db, t } = await getDb();
	const existing = await db
		.select({ id: t.admins.id })
		.from(t.admins)
		.where(eq(t.admins.username, "admin"))
		.limit(1);
	if (existing.length === 0) {
		const { hash, salt } = hashPassword("admin12345678");
		await db
			.insert(t.admins)
			.values({ username: "admin", passwordHash: hash, passwordSalt: salt });
	}
}

export async function createAdmin(
	username: string,
	password: string,
): Promise<boolean> {
	const strengthCheck = validatePasswordStrength(password);
	if (!strengthCheck.valid) {
		throw new Error(strengthCheck.error);
	}
	const { db, t } = await getDb();
	const { hash, salt } = hashPassword(password);
	try {
		await db
			.insert(t.admins)
			.values({ username, passwordHash: hash, passwordSalt: salt });
		return true;
	} catch {
		return false;
	}
}

export async function verifyAdmin(
	username: string,
	password: string,
): Promise<boolean> {
	const { db, t } = await getDb();
	const rows = await db
		.select()
		.from(t.admins)
		.where(eq(t.admins.username, username))
		.limit(1);
	const row = rows[0];
	if (!row) return false;
	const { valid, needsUpgrade } = verifyPassword(
		password,
		row.passwordHash,
		row.passwordSalt,
	);
	if (valid && needsUpgrade) {
		const upgraded = hashPassword(password, row.passwordSalt);
		await db
			.update(t.admins)
			.set({ passwordHash: upgraded.hash })
			.where(eq(t.admins.username, username));
	}
	return valid;
}

function normalizeDatetime(value: string): string {
	return String(value).replace("T", " ").slice(0, 19);
}

export async function listAdmins(): Promise<
	{ id: number; username: string; email: string; createdAt: string }[]
> {
	const { db, t } = await getDb();
	const rows = await db.select().from(t.admins).orderBy(t.admins.id);
	return rows.map((r) => ({
		id: r.id,
		username: r.username,
		email: r.email || "",
		createdAt: normalizeDatetime(r.createdAt),
	}));
}

export async function countAdmins(): Promise<number> {
	const { db, t } = await getDb();
	const rows = await db.select({ count: sql<number>`count(*)` }).from(t.admins);
	return Number(rows[0].count);
}

export async function changePassword(
	username: string,
	newPassword: string,
): Promise<boolean> {
	const strengthCheck = validatePasswordStrength(newPassword);
	if (!strengthCheck.valid) {
		throw new Error(strengthCheck.error);
	}
	const { db, t } = await getDb();
	const { hash, salt } = hashPassword(newPassword);
	const result = await db
		.update(t.admins)
		.set({ passwordHash: hash, passwordSalt: salt })
		.where(eq(t.admins.username, username))
		.returning({ id: t.admins.id });
	return result.length > 0;
}

export async function deleteAdmin(username: string): Promise<boolean> {
	if ((await countAdmins()) <= 1) return false;
	const { db, t } = await getDb();
	const result = await db
		.delete(t.admins)
		.where(eq(t.admins.username, username))
		.returning({ id: t.admins.id });
	return result.length > 0;
}

export async function getAdminEmail(username: string): Promise<string | null> {
	const { db, t } = await getDb();
	const rows = await db
		.select({ email: t.admins.email })
		.from(t.admins)
		.where(eq(t.admins.username, username))
		.limit(1);
	return rows[0]?.email || null;
}

export async function setAdminEmail(
	username: string,
	email: string,
): Promise<boolean> {
	const { db, t } = await getDb();
	const result = await db
		.update(t.admins)
		.set({ email })
		.where(eq(t.admins.username, username))
		.returning({ id: t.admins.id });
	return result.length > 0;
}

export async function storeResetToken(
	username: string,
	token: string,
	expiresAt: Date,
): Promise<boolean> {
	const { db, t } = await getDb();
	const result = await db
		.update(t.admins)
		.set({ resetToken: token, resetTokenExpires: expiresAt.toISOString() })
		.where(eq(t.admins.username, username))
		.returning({ id: t.admins.id });
	return result.length > 0;
}

export async function consumeResetToken(token: string): Promise<string | null> {
	const { db, t } = await getDb();
	const rows = await db
		.select()
		.from(t.admins)
		.where(eq(t.admins.resetToken, token))
		.limit(1);
	const row = rows[0];
	if (!row) return null;
	if (
		!row.resetTokenExpires ||
		Date.parse(row.resetTokenExpires) <= Date.now()
	) {
		return null;
	}
	await db
		.update(t.admins)
		.set({ resetToken: "", resetTokenExpires: null })
		.where(eq(t.admins.id, row.id));
	return row.username;
}

export async function clearResetToken(username: string): Promise<boolean> {
	const { db, t } = await getDb();
	const result = await db
		.update(t.admins)
		.set({ resetToken: "", resetTokenExpires: null })
		.where(eq(t.admins.username, username))
		.returning({ id: t.admins.id });
	return result.length > 0;
}
