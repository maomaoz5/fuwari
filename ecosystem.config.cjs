// PM2 配置
//
// 敏感信息（数据库口令、AI Key、邮件 Key）不再写在本文件里，
// 统一放在服务器上的 .env.production（权限 600），由下面的 loadEnvFile 读取。
// 本文件可安全提交到版本库。

const fs = require("node:fs");
const path = require("node:path");

function loadEnvFile(file) {
	const env = {};
	if (!fs.existsSync(file)) return env;
	for (const raw of fs.readFileSync(file, "utf-8").split(/\r?\n/)) {
		const line = raw.trim();
		if (!line || line.startsWith("#")) continue;
		const eq = line.indexOf("=");
		if (eq === -1) continue;
		const key = line.slice(0, eq).trim();
		let value = line.slice(eq + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		env[key] = value;
	}
	return env;
}

const fileEnv = loadEnvFile(path.join(__dirname, ".env.production"));
const dbType = fileEnv.DB_TYPE || "sqlite";

if (dbType === "postgres" && !fileEnv.DATABASE_URL) {
	throw new Error(
		`DB_TYPE=postgres 但未提供 DATABASE_URL。请在 ${path.join(__dirname, ".env.production")} 中配置。`,
	);
}

module.exports = {
	apps: [
		{
			name: "fuwari-blog",
			script: "dist/server/entry.mjs",
			cwd: __dirname,
			instances: 1,
			autorestart: true,
			watch: false,
			max_memory_restart: "512M",
			env: {
				...fileEnv,
				NODE_ENV: "production",
				PORT: fileEnv.PORT || 4321,
				HOST: fileEnv.HOST || "0.0.0.0",
				DB_TYPE: dbType,
			},
		},
	],
};
