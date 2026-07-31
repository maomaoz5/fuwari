export interface DbDriver {
  init(): Promise<void>;
  recordVisit(pagePath: string): Promise<void>;
  recordArticleView(slug: string): Promise<void>;
  getStats(range: "7d" | "30d" | "all"): Promise<{
    totalPageViews: number;
    totalArticleViews: number;
    dailyViews: { date: string; count: number }[];
    topArticles: { slug: string; count: number }[];
  }>;
  createAdmin(username: string, password: string): Promise<boolean>;
  verifyAdmin(username: string, password: string): Promise<boolean>;
  listAdmins(): Promise<{ id: number; username: string; createdAt: string }[]>;
  changePassword(username: string, newPassword: string): Promise<boolean>;
  deleteAdmin(username: string): Promise<boolean>;
  close(): Promise<void>;
  resetForTesting(): Promise<void>;
}
