import { beforeEach, describe, expect, it } from "vitest";
import { initTestDb } from "../db/testing";
import {
	createAdmin,
	verifyAdmin,
	listAdmins,
	changePassword,
	deleteAdmin,
	getAdminEmail,
	setAdminEmail,
	storeResetToken,
	consumeResetToken,
} from "./admins-repo";

beforeEach(async () => {
	await initTestDb();
});

describe("admins repo", () => {
	it("creates default admin", async () => {
		const admins = await listAdmins();
		expect(admins).toHaveLength(1);
		expect(admins[0].username).toBe("admin");
	});

	it("verifies credentials incl. wrong password and unknown user", async () => {
		expect(await verifyAdmin("admin", "admin12345678")).toBe(true);
		expect(await verifyAdmin("admin", "wrongpassword1")).toBe(false);
		expect(await verifyAdmin("nobody", "admin12345678")).toBe(false);
	});

	it("create/verify/duplicate", async () => {
		expect(await createAdmin("u1", "password12345")).toBe(true);
		expect(await createAdmin("u1", "password12345")).toBe(false);
		await expect(createAdmin("u2", "short")).rejects.toThrow("密码长度");
		expect(await verifyAdmin("u1", "password12345")).toBe(true);
	});

	it("change password", async () => {
		await createAdmin("u1", "password12345");
		expect(await changePassword("u1", "newpassword123")).toBe(true);
		expect(await verifyAdmin("u1", "newpassword123")).toBe(true);
		expect(await changePassword("ghost", "newpassword123")).toBe(false);
	});

	it("delete admin + last-admin guard", async () => {
		await createAdmin("u1", "password12345");
		expect(await deleteAdmin("u1")).toBe(true);
		expect(await deleteAdmin("admin")).toBe(false);
	});

	it("list admins has no password fields", async () => {
		await createAdmin("u1", "password12345");
		const admins = await listAdmins();
		for (const a of admins) {
			expect(a).not.toHaveProperty("passwordHash");
			expect(a).not.toHaveProperty("passwordSalt");
		}
	});

	it("email set/get", async () => {
		expect(await setAdminEmail("admin", "a@b.com")).toBe(true);
		expect(await getAdminEmail("admin")).toBe("a@b.com");
		expect(await getAdminEmail("ghost")).toBeNull();
	});

	it("reset token store/consume/expiry", async () => {
		await setAdminEmail("admin", "a@b.com");
		const future = new Date(Date.now() + 30 * 60 * 1000);
		expect(await storeResetToken("admin", "tok", future)).toBe(true);
		expect(await consumeResetToken("tok")).toBe("admin");
		expect(await consumeResetToken("tok")).toBeNull();

		await storeResetToken("admin", "tok2", new Date(Date.now() - 1000));
		expect(await consumeResetToken("tok2")).toBeNull();
	});
});
