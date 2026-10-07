import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { apiApp } from "../app";
import { initTestDb } from "../db/testing";
import { createSession } from "../services/session";

let cookie = "";

beforeEach(async () => {
	process.env.CONFIG_OVERRIDES_PATH = path.join(
		fs.mkdtempSync(path.join(os.tmpdir(), "fuwari-cfg-")),
		"overrides.json",
	);
	await initTestDb();
	const token = await createSession("admin");
	cookie = `fuwari_session=${token}`;
});

const h = () => ({ cookie, "Content-Type": "application/json" });

describe("admins routes", () => {
	it("requires auth", async () => {
		expect((await apiApp.request("/api/admin/admins")).status).toBe(401);
	});

	it("lists default admin", async () => {
		const res = await apiApp.request("/api/admin/admins", {
			headers: { cookie },
		});
		expect(res.status).toBe(200);
		const data = (await res.json()).data;
		expect(data).toHaveLength(1);
		expect(data[0].username).toBe("admin");
	});

	it("creates admin; duplicate 409; weak password 400", async () => {
		const create = await apiApp.request("/api/admin/admins", {
			method: "POST",
			headers: h(),
			body: JSON.stringify({ username: "u1", password: "password12345" }),
		});
		expect(create.status).toBe(201);
		const dup = await apiApp.request("/api/admin/admins", {
			method: "POST",
			headers: h(),
			body: JSON.stringify({ username: "u1", password: "password12345" }),
		});
		expect(dup.status).toBe(409);
		const weak = await apiApp.request("/api/admin/admins", {
			method: "POST",
			headers: h(),
			body: JSON.stringify({ username: "u2", password: "short" }),
		});
		expect(weak.status).toBe(400);
	});

	it("PUT change password requires target's current password", async () => {
		await apiApp.request("/api/admin/admins", {
			method: "POST",
			headers: h(),
			body: JSON.stringify({ username: "u1", password: "password12345" }),
		});
		const wrong = await apiApp.request("/api/admin/admins/u1", {
			method: "PUT",
			headers: h(),
			body: JSON.stringify({
				currentPassword: "badbadbadbad",
				newPassword: "newpassword123",
			}),
		});
		expect(wrong.status).toBe(403);
		const right = await apiApp.request("/api/admin/admins/u1", {
			method: "PUT",
			headers: h(),
			body: JSON.stringify({
				currentPassword: "password12345",
				newPassword: "newpassword123",
			}),
		});
		expect(right.status).toBe(200);
	});

	it("DELETE requires operator password; last-admin guard", async () => {
		await apiApp.request("/api/admin/admins", {
			method: "POST",
			headers: h(),
			body: JSON.stringify({ username: "u1", password: "password12345" }),
		});
		const noPw = await apiApp.request("/api/admin/admins/u1", {
			method: "DELETE",
			headers: h(),
			body: JSON.stringify({}),
		});
		expect(noPw.status).toBe(400);
		const badPw = await apiApp.request("/api/admin/admins/u1", {
			method: "DELETE",
			headers: h(),
			body: JSON.stringify({ confirmPassword: "wrongwrongwro" }),
		});
		expect(badPw.status).toBe(403);
		const okDel = await apiApp.request("/api/admin/admins/u1", {
			method: "DELETE",
			headers: h(),
			body: JSON.stringify({ confirmPassword: "admin12345678" }),
		});
		expect(okDel.status).toBe(200);

		const last = await apiApp.request("/api/admin/admins/admin", {
			method: "DELETE",
			headers: h(),
			body: JSON.stringify({ confirmPassword: "admin12345678" }),
		});
		expect(last.status).toBe(400);
	});

	it("update-email sets operator email with validation", async () => {
		const bad = await apiApp.request("/api/admin/update-email", {
			method: "POST",
			headers: h(),
			body: JSON.stringify({ email: "not-an-email" }),
		});
		expect(bad.status).toBe(400);
		const good = await apiApp.request("/api/admin/update-email", {
			method: "POST",
			headers: h(),
			body: JSON.stringify({ email: "a@b.com" }),
		});
		expect(good.status).toBe(200);
		const list = (
			await (
				await apiApp.request("/api/admin/admins", { headers: { cookie } })
			).json()
		).data;
		expect(
			list.find((a: { username: string }) => a.username === "admin").email,
		).toBe("a@b.com");
	});
});
