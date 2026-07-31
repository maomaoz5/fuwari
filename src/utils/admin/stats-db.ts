import { type DbDriver } from "./db-interface";

const DB_TYPE =
  import.meta.env?.DB_TYPE || process.env.DB_TYPE || "sqlite";

let driver: DbDriver | null = null;

async function getDriver(): Promise<DbDriver> {
  if (driver) return driver;

  if (DB_TYPE === "postgres") {
    const { PostgresDriver } = await import("./db-postgres");
    driver = new PostgresDriver();
  } else {
    const { SqliteDriver } = await import("./db-sqlite");
    driver = new SqliteDriver();
  }

  await driver.init();
  return driver;
}

// 记录页面访问
export async function recordVisit(pagePath: string): Promise<void> {
  const d = await getDriver();
  return d.recordVisit(pagePath);
}

// 记录文章阅读
export async function recordArticleView(slug: string): Promise<void> {
  const d = await getDriver();
  return d.recordArticleView(slug);
}

// 获取统计数据
export async function getStats(range: "7d" | "30d" | "all") {
  const d = await getDriver();
  return d.getStats(range);
}

// 创建管理员
export async function createAdmin(
  username: string,
  password: string,
): Promise<boolean> {
  const d = await getDriver();
  return d.createAdmin(username, password);
}

// 验证管理员
export async function verifyAdmin(
  username: string,
  password: string,
): Promise<boolean> {
  const d = await getDriver();
  return d.verifyAdmin(username, password);
}

// 列出所有管理员
export async function listAdmins() {
  const d = await getDriver();
  return d.listAdmins();
}

// 修改密码
export async function changePassword(
  username: string,
  newPassword: string,
): Promise<boolean> {
  const d = await getDriver();
  return d.changePassword(username, newPassword);
}

// 删除管理员
export async function deleteAdmin(username: string): Promise<boolean> {
  const d = await getDriver();
  return d.deleteAdmin(username);
}

// 关闭数据库连接（用于优雅退出）
export async function closeDb(): Promise<void> {
  if (driver) {
    await driver.close();
    driver = null;
  }
}

// 重置管理员表（仅用于测试）
export async function resetAdminsForTesting(): Promise<void> {
  const d = await getDriver();
  return d.resetForTesting();
}
