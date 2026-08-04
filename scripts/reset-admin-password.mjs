/**
 * 管理员密码重置脚本
 * 用法: node scripts/reset-admin-password.mjs
 *
 * 功能：生成随机密码，使用 PBKDF2+SHA512 哈希后更新 admins 表中第一个管理员的密码
 * 支持 SQLite 和 PostgreSQL（通过环境变量 DB_TYPE 或自动检测）
 */
import crypto from "node:crypto";

const PBKDF2_ITERATIONS = 600_000;

// ─── 生成随机密码（16位，包含大小写、数字、特殊字符）──────────────────────────
function generatePassword(length = 16) {
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const digits = "0123456789";
  const special = "!@#$%^&*+-=";
  const all = upper + lower + digits + special;

  // 确保每种字符至少出现一次
  const pick = (chars) => chars[crypto.randomInt(0, chars.length)];
  const mandatory = [pick(upper), pick(lower), pick(digits), pick(special)];

  const rest = Array.from({ length: length - mandatory.length }, () =>
    pick(all)
  );

  // Fisher-Yates 洗牌
  const password = [...mandatory, ...rest];
  for (let i = password.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [password[i], password[j]] = [password[j], password[i]];
  }
  return password.join("");
}

// ─── PBKDF2 哈希（与项目 security.ts 中 hashPassword 一致）──────────────────
function hashPassword(password, salt) {
  const useSalt = salt || crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(password, useSalt, PBKDF2_ITERATIONS, 64, "sha512")
    .toString("hex");
  return { hash, salt: useSalt };
}

// ─── 从 .env 文件读取环境变量（轻量实现，不依赖 dotenv）──────────────────────
async function loadEnv() {
  try {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const envPath = path.join(process.cwd(), ".env");
    const content = fs.readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx);
      const value = trimmed.slice(eqIdx + 1);
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // .env 文件不存在或读取失败，忽略
  }
}

// ─── SQLite 重置 ─────────────────────────────────────────────────────────────
async function resetSQLite() {
  const { default: Database } = await import("better-sqlite3");
  const path = await import("node:path");
  const fs = await import("node:fs");

  const dbPath = path.join(process.cwd(), "data", "stats.db");
  if (!fs.existsSync(dbPath)) {
    throw new Error(`SQLite 数据库文件不存在: ${dbPath}`);
  }

  const db = new Database(dbPath);
  const admin = db
    .prepare("SELECT id, username FROM admins ORDER BY id ASC LIMIT 1")
    .get();

  if (!admin) {
    console.error("❌ 数据库中没有找到管理员账号！");
    db.close();
    process.exit(1);
  }

  const newPassword = generatePassword();
  const { hash, salt } = hashPassword(newPassword);

  const result = db
    .prepare(
      "UPDATE admins SET password_hash = ?, password_salt = ? WHERE id = ?"
    )
    .run(hash, salt, admin.id);

  if (result.changes === 0) {
    console.error("❌ 密码更新失败！");
    db.close();
    process.exit(1);
  }

  console.log("✅ 密码已成功重置！(SQLite)");
  printResult(admin.username, newPassword);
  db.close();
}

// ─── PostgreSQL 重置 ─────────────────────────────────────────────────────────
async function resetPostgres() {
  const { default: pg } = await import("pg");

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "PostgreSQL 模式需要设置 DATABASE_URL 环境变量（在 .env 文件中配置）"
    );
  }

  const pool = new pg.Pool({ connectionString, max: 1 });

  try {
    const adminResult = await pool.query(
      "SELECT id, username FROM admins ORDER BY id ASC LIMIT 1"
    );
    const admin = adminResult.rows[0];

    if (!admin) {
      console.error("❌ 数据库中没有找到管理员账号！");
      process.exit(1);
    }

    const newPassword = generatePassword();
    const { hash, salt } = hashPassword(newPassword);

    const updateResult = await pool.query(
      "UPDATE admins SET password_hash = $1, password_salt = $2 WHERE id = $3",
      [hash, salt, admin.id]
    );

    if ((updateResult.rowCount ?? 0) === 0) {
      console.error("❌ 密码更新失败！");
      process.exit(1);
    }

    console.log("✅ 密码已成功重置！(PostgreSQL)");
    printResult(admin.username, newPassword);
  } finally {
    await pool.end();
  }
}

// ─── 输出结果 ─────────────────────────────────────────────────────────────────
function printResult(username, password) {
  console.log("");
  console.log("┌─────────────────────────────────────────┐");
  console.log(`│  用户名: ${username}`);
  console.log(`│  新密码: ${password}`);
  console.log("└─────────────────────────────────────────┘");
  console.log("");
  console.log("⚠️  请妥善保存新密码，登录后建议尽快修改。");
}

// ─── 主逻辑 ─────────────────────────────────────────────────────────────────
async function main() {
  await loadEnv();

  const dbType = (process.env.DB_TYPE || "sqlite").toLowerCase();

  if (dbType === "postgres" || dbType === "postgresql") {
    console.log("📦 使用 PostgreSQL 数据库...");
    await resetPostgres();
  } else {
    console.log("📦 使用 SQLite 数据库...");
    await resetSQLite();
  }
}

main().catch((err) => {
  console.error("❌ 脚本执行失败:", err.message);
  process.exit(1);
});
