export class ApiError extends Error {
	constructor(
		public status: number,
		public code: string,
		message: string,
		public data?: Record<string, unknown>,
	) {
		super(message);
	}
}

function isPublicRoute(): boolean {
	return (
		location.hash.startsWith("#/login") ||
		location.hash.startsWith("#/reset-password")
	);
}

export async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
	// 站点 trailingSlash=always:无尾斜杠的路径会被 Astro dev server 拦截 404
	const normalizedPath = path.endsWith("/") || path.includes("?") ? path : `${path}/`;
	const res = await fetch(normalizedPath, {
		headers: { "Content-Type": "application/json", ...(opts.headers ?? {}) },
		...opts,
	});
	const body = (await res.json().catch(() => null)) as
		| {
				ok: boolean;
				data?: T;
				error?: { code: string; message: string } & Record<string, unknown>;
		  }
		| null;

	if (!res.ok || !body?.ok) {
		if (res.status === 401 && !isPublicRoute()) {
			location.hash = "#/login";
		}
		throw new ApiError(
			res.status,
			body?.error?.code ?? "unknown",
			body?.error?.message ?? `HTTP ${res.status}`,
			body?.error,
		);
	}
	return body.data as T;
}
