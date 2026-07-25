import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface SummaryCacheEntry {
	title: string;
	summary: string;
	generatedAt: string;
	contentHash: string;
}

/**
 * Compute SHA-256 hash of content string
 */
export function computeContentHash(content: string): string {
	return createHash("sha256").update(content, "utf-8").digest("hex");
}

/**
 * Check if a cached summary exists and the content hasn't changed
 */
export function isCacheValid(
	cacheDir: string,
	slug: string,
	content: string,
): boolean {
	const entry = readCacheEntry(cacheDir, slug);
	if (!entry) return false;

	const currentHash = computeContentHash(content);
	return entry.contentHash === currentHash;
}

/**
 * Read a cache entry for a given slug, returns null if not found or invalid
 */
export function readCacheEntry(
	cacheDir: string,
	slug: string,
): SummaryCacheEntry | null {
	const filePath = join(cacheDir, `${slug}.json`);
	if (!existsSync(filePath)) return null;

	try {
		const raw = readFileSync(filePath, "utf-8");
		const entry = JSON.parse(raw) as SummaryCacheEntry;
		return entry;
	} catch {
		console.warn(`[ai-summary-cache] Failed to read cache for slug: ${slug}`);
		return null;
	}
}

/**
 * Write a cache entry to disk
 */
export function writeCacheEntry(
	cacheDir: string,
	slug: string,
	entry: SummaryCacheEntry,
): void {
	ensureCacheDir(cacheDir);
	const filePath = join(cacheDir, `${slug}.json`);
	writeFileSync(filePath, JSON.stringify(entry, null, 2), "utf-8");
}

/**
 * Ensure the cache directory exists
 */
export function ensureCacheDir(cacheDir: string): void {
	if (!existsSync(cacheDir)) {
		mkdirSync(cacheDir, { recursive: true });
	}
}
