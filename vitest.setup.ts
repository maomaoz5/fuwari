import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DB_TYPE = "sqlite";
process.env.CREATE_DEFAULT_ADMIN = "true";

// 验证码禁用:captcha provider 从覆盖配置读取
const overridesPath = path.join(
	os.tmpdir(),
	`fuwari-test-overrides-${process.pid}.json`,
);
fs.writeFileSync(overridesPath, JSON.stringify({ captcha: { provider: "none" } }));
process.env.CONFIG_OVERRIDES_PATH = overridesPath;
