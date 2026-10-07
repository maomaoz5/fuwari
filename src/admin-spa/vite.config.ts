import path from "node:path";
import { fileURLToPath } from "node:url";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	root,
	plugins: [svelte(), tailwindcss()],
	build: {
		outDir: path.resolve(root, "../../public/admin"),
		emptyOutDir: true,
	},
	server: {
		port: 5175,
		proxy: { "/api": "http://localhost:4322" },
	},
});
