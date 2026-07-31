/// <reference types="astro/client" />
/// <reference path="../.astro/types.d.ts" />

declare namespace App {
	interface Locals {
		username?: string;
	}
}

interface ImportMetaEnv {
	readonly OPENROUTER_API_KEY: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
