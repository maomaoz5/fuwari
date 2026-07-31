import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	changePassword,
	createAdmin,
	deleteAdmin,
	listAdmins,
	resetAdminsForTesting,
	verifyAdmin,
} from "../admin/stats-db";

describe("Admin management", () => {
	beforeEach(async () => {
		// 重置管理员表，确保干净状态
		await resetAdminsForTesting();
	});

	afterEach(async () => {
		// 每个测试后重置
		await resetAdminsForTesting();
	});

	it("should create default admin on first init", async () => {
		const admins = await listAdmins();
		expect(admins.length).toBe(1);
		expect(admins[0].username).toBe("admin");
	});

	it("should verify default admin credentials", async () => {
		expect(await verifyAdmin("admin", "admin123")).toBe(true);
		expect(await verifyAdmin("admin", "wrongpassword")).toBe(false);
		expect(await verifyAdmin("nonexistent", "admin123")).toBe(false);
	});

	it("should create a new admin", async () => {
		const result = await createAdmin("testuser", "testpass123");
		expect(result).toBe(true);

		const admins = await listAdmins();
		expect(admins.length).toBe(2);
		expect(
			admins.some((a: { username: string }) => a.username === "testuser"),
		).toBe(true);
	});

	it("should not create duplicate admin", async () => {
		const result = await createAdmin("admin", "anotherpassword");
		expect(result).toBe(false);
	});

	it("should verify newly created admin", async () => {
		await createAdmin("newadmin", "securepass");
		expect(await verifyAdmin("newadmin", "securepass")).toBe(true);
		expect(await verifyAdmin("newadmin", "wrongpass")).toBe(false);
	});

	it("should change password", async () => {
		await createAdmin("user1", "oldpass");
		expect(await verifyAdmin("user1", "oldpass")).toBe(true);

		const result = await changePassword("user1", "newpass");
		expect(result).toBe(true);
		expect(await verifyAdmin("user1", "newpass")).toBe(true);
		expect(await verifyAdmin("user1", "oldpass")).toBe(false);
	});

	it("should not change password for nonexistent user", async () => {
		const result = await changePassword("nonexistent", "newpass");
		expect(result).toBe(false);
	});

	it("should delete admin", async () => {
		await createAdmin("todelete", "delpass");
		expect((await listAdmins()).length).toBe(2);

		const result = await deleteAdmin("todelete");
		expect(result).toBe(true);
		expect((await listAdmins()).length).toBe(1);
	});

	it("should not delete the last admin", async () => {
		const admins = await listAdmins();
		expect(admins.length).toBe(1);

		const result = await deleteAdmin("admin");
		expect(result).toBe(false);
		expect((await listAdmins()).length).toBe(1);
	});

	it("should list admins without password info", async () => {
		await createAdmin("user2", "pass2");
		const admins = await listAdmins();

		expect(admins.length).toBe(2);
		for (const admin of admins) {
			expect(admin).toHaveProperty("id");
			expect(admin).toHaveProperty("username");
			expect(admin).toHaveProperty("createdAt");
			expect(admin).not.toHaveProperty("password_hash");
			expect(admin).not.toHaveProperty("password_salt");
		}
	});
});
