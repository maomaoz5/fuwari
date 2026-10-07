import { eq } from "drizzle-orm";
import { getDb } from "../db";

export async function checkRateLimit(
	key: string,
	maxAttempts: number,
	windowMs: number,
): Promise<{ allowed: boolean; retryAfter?: number }> {
	const { db, t } = await getDb();
	const now = Date.now();

	const rows = await db
		.select()
		.from(t.rateLimits)
		.where(eq(t.rateLimits.key, key))
		.limit(1);
	const row = rows[0];

	if (!row || Date.parse(row.windowExpiresAt) <= now) {
		const windowExpiresAt = new Date(now + windowMs).toISOString();
		await db
			.insert(t.rateLimits)
			.values({ key, count: 1, windowExpiresAt })
			.onConflictDoUpdate({
				target: t.rateLimits.key,
				set: { count: 1, windowExpiresAt },
			});
		return { allowed: true };
	}

	if (row.count >= maxAttempts) {
		return {
			allowed: false,
			retryAfter: Math.ceil((Date.parse(row.windowExpiresAt) - now) / 1000),
		};
	}

	await db
		.update(t.rateLimits)
		.set({ count: row.count + 1 })
		.where(eq(t.rateLimits.key, key));
	return { allowed: true };
}
