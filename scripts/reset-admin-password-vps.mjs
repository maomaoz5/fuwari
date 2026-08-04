#!/usr/bin/env node
/**
 * VPS密码重置脚本（硬编码DATABASE_URL）
 */
import crypto from "node:crypto";

const PBKDF2_ITERATIONS = 600_000;

function generatePassword(length = 16) {
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const digits = "0123456789";
  const special = "!@#$%^&*+-=";
  const all = upper + lower + digits + special;

  const pick = (chars) => chars[crypto.randomInt(0, chars.length)];
  const mandatory = [pick(upper), pick(lower), pick(digits), pick(special)];

  const rest = Array.from({ length: length - mandatory.length }, () =>
    pick(all)
  );

  const password = [...mandatory, ...rest];
  for (let i = password.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [password[i], password[j]] = [password[j], password[i]];
  }
  return password.join("");
}

function hashPassword(password, salt) {
  const useSalt = salt || crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(password, useSalt, PBKDF2_ITERATIONS, 64, "sha512")
    .toString("hex");
  return { hash, salt: useSalt };
}

async function resetPostgres() {
  const { default: pg } = await import("pg");

  const connectionString = "postgresql://fuwari_blog:KxM5pDn2Zx4P7RH4@localhost:5432/fuwari_blog";

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
    console.log("");
    console.log("┌─────────────────────────────────────────┐");
    console.log(`│  用户名: ${admin.username}`);
    console.log(`│  新密码: ${newPassword}`);
    console.log("└─────────────────────────────────────────┘");
    console.log("");
    console.log("⚠️  请妥善保存新密码，登录后建议尽快修改。");
  } finally {
    await pool.end();
  }
}

resetPostgres().catch((err) => {
  console.error("❌ 脚本执行失败:", err.message);
  process.exit(1);
});
