import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../http";
import { fail, ok } from "../http";
import { requireAuth } from "../middleware/auth";
import {
	changePassword,
	createAdmin,
	deleteAdmin,
	listAdmins,
	setAdminEmail,
	verifyAdmin,
} from "../services/admins-repo";
import { validatePasswordStrength } from "../services/security";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const CreateAdminSchema = z.object({
	username: z.string().min(1),
	password: z.string().min(1),
});

const ChangePasswordSchema = z.object({
	currentPassword: z.string().min(1),
	newPassword: z.string().min(1),
});

const DeleteAdminSchema = z.object({ confirmPassword: z.string().min(1) });
const UpdateEmailSchema = z.object({ email: z.string().min(1) });

export const adminsRoutes = new Hono<AppEnv>();

adminsRoutes.get("/admin/admins", requireAuth, async (c) =>
	ok(c, await listAdmins()),
);

adminsRoutes.post("/admin/admins", requireAuth, async (c) => {
	const parsed = CreateAdminSchema.safeParse(
		await c.req.json().catch(() => null),
	);
	if (!parsed.success) {
		return fail(
			c,
			400,
			"invalid_request",
			"Missing required fields: username, password",
		);
	}
	const strength = validatePasswordStrength(parsed.data.password);
	if (!strength.valid) {
		return fail(c, 400, "weak_password", strength.error ?? "密码强度不足");
	}
	const success = await createAdmin(parsed.data.username, parsed.data.password);
	if (!success) {
		return fail(
			c,
			409,
			"conflict",
			"Failed to create admin (username may already exist)",
		);
	}
	return c.json({ ok: true, data: { username: parsed.data.username } }, 201);
});

adminsRoutes.put("/admin/admins/:username", requireAuth, async (c) => {
	const username = c.req.param("username");
	const parsed = ChangePasswordSchema.safeParse(
		await c.req.json().catch(() => null),
	);
	if (!parsed.success) {
		return fail(c, 400, "invalid_request", "Current password is required");
	}
	const verified = await verifyAdmin(username, parsed.data.currentPassword);
	if (!verified) {
		return fail(c, 403, "forbidden", "Current password is incorrect");
	}
	const success = await changePassword(username, parsed.data.newPassword);
	if (!success) {
		return fail(c, 404, "not_found", "Admin not found");
	}
	return ok(c, { username });
});

adminsRoutes.delete("/admin/admins/:username", requireAuth, async (c) => {
	const username = c.req.param("username");
	const parsed = DeleteAdminSchema.safeParse(
		await c.req.json().catch(() => null),
	);
	if (!parsed.success) {
		return fail(c, 400, "invalid_request", "Password confirmation is required");
	}
	const operator = c.get("username");
	const verified = await verifyAdmin(operator, parsed.data.confirmPassword);
	if (!verified) {
		return fail(c, 403, "forbidden", "Password confirmation failed");
	}
	const success = await deleteAdmin(username);
	if (!success) {
		return fail(
			c,
			400,
			"bad_request",
			"Cannot delete admin (not found or is the last admin)",
		);
	}
	return ok(c, { username });
});

adminsRoutes.post("/admin/update-email", requireAuth, async (c) => {
	const parsed = UpdateEmailSchema.safeParse(
		await c.req.json().catch(() => null),
	);
	if (!parsed.success) {
		return fail(c, 400, "invalid_request", "Email is required");
	}
	const email = parsed.data.email.trim();
	if (!EMAIL_REGEX.test(email)) {
		return fail(c, 400, "invalid_email", "Invalid email format");
	}
	const success = await setAdminEmail(c.get("username"), email);
	if (!success) {
		return fail(c, 404, "not_found", "Admin not found");
	}
	return ok(c, { email });
});
