import { sql } from "drizzle-orm";
import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const admins = pgTable("admins", {
	id: serial("id").primaryKey(),
	username: text("username").notNull().unique(),
	passwordHash: text("password_hash").notNull(),
	passwordSalt: text("password_salt").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
		.notNull()
		.default(sql`NOW()`),
	email: text("email").notNull().default(""),
	resetToken: text("reset_token").notNull().default(""),
	resetTokenExpires: timestamp("reset_token_expires", {
		withTimezone: true,
		mode: "string",
	}),
});

export const sessions = pgTable("sessions", {
	tokenHash: text("token_hash").primaryKey(),
	username: text("username").notNull(),
	createdAt: timestamp("created_at", {
		withTimezone: true,
		mode: "string",
	}).notNull(),
	expiresAt: timestamp("expires_at", {
		withTimezone: true,
		mode: "string",
	}).notNull(),
	ip: text("ip"),
	userAgent: text("user_agent"),
});

export const rateLimits = pgTable("rate_limits", {
	key: text("key").primaryKey(),
	count: integer("count").notNull(),
	windowExpiresAt: timestamp("window_expires_at", {
		withTimezone: true,
		mode: "string",
	}).notNull(),
});

export const pageViews = pgTable("page_views", {
	id: serial("id").primaryKey(),
	path: text("path").notNull(),
	visitedAt: timestamp("visited_at", { withTimezone: true, mode: "string" })
		.notNull()
		.default(sql`NOW()`),
});

export const articleViews = pgTable("article_views", {
	id: serial("id").primaryKey(),
	slug: text("slug").notNull(),
	visitedAt: timestamp("visited_at", { withTimezone: true, mode: "string" })
		.notNull()
		.default(sql`NOW()`),
});
