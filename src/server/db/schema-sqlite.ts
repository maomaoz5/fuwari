import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const admins = sqliteTable("admins", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	username: text("username").notNull().unique(),
	passwordHash: text("password_hash").notNull(),
	passwordSalt: text("password_salt").notNull(),
	createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
	email: text("email").notNull().default(""),
	resetToken: text("reset_token").notNull().default(""),
	resetTokenExpires: text("reset_token_expires"),
});

export const sessions = sqliteTable("sessions", {
	tokenHash: text("token_hash").primaryKey(),
	username: text("username").notNull(),
	createdAt: text("created_at").notNull(),
	expiresAt: text("expires_at").notNull(),
	ip: text("ip"),
	userAgent: text("user_agent"),
});

export const rateLimits = sqliteTable("rate_limits", {
	key: text("key").primaryKey(),
	count: integer("count").notNull(),
	windowExpiresAt: text("window_expires_at").notNull(),
});

export const pageViews = sqliteTable("page_views", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	path: text("path").notNull(),
	visitedAt: text("visited_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const articleViews = sqliteTable("article_views", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	slug: text("slug").notNull(),
	visitedAt: text("visited_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
