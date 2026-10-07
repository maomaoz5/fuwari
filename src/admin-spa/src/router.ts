export type Route = {
	name: string;
	params: Record<string, string>;
	query: URLSearchParams;
};

export function parseHash(hash: string): Route {
	const clean = hash.replace(/^#\/?/, "");
	const [pathPart, queryPart] = clean.split("?");
	const segs = pathPart.split("/").filter(Boolean);
	const name = segs[0] || "login";
	const params: Record<string, string> = {};
	if (name === "posts" && segs[1]) params.slug = segs[1];
	return { name, params, query: new URLSearchParams(queryPart ?? "") };
}

export function navigate(to: string): void {
	location.hash = to;
}
