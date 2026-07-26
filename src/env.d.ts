/// <reference types="astro/client" />
/// <reference path="../.astro/types.d.ts" />

interface ImportMetaEnv {
	readonly OPENROUTER_API_KEY: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
