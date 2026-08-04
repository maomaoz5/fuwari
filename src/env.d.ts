/// <reference types="astro/client" />
/// <reference path="../.astro/types.d.ts" />

declare namespace App {
	interface Locals {
		username?: string;
	}
}

interface ImportMetaEnv {
	readonly OPENROUTER_API_KEY: string;
	readonly DB_TYPE: string;
	readonly DATABASE_URL: string;
	readonly RESEND_API_KEY: string;
	readonly SMTP_FROM: string;
	readonly SITE_URL: string;
	readonly CREATE_DEFAULT_ADMIN: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
