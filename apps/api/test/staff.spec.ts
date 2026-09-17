import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { INestApplication } from "@nestjs/common";
import {
  Agent,
  agentWithCsrf,
  patch,
  post,
  registerCustomer,
  resetDb,
  seedAdmin,
  startApp,
} from "./helpers";
import { PrismaService } from "../src/prisma/prisma.service";
import { AuthService } from "../src/auth/auth.service";

describe("STAFF", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let auth: AuthService;

  beforeAll(async () => {
    ({ app, prisma, auth } = await startApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedAdmin(prisma, auth);
  });

  async function loginAdmin(): Promise<Agent> {
    const agent = await agentWithCsrf(app);
    const response = await post(agent, "/api/v1/auth/login", {
      email: "admin@example.com",
      password: "ChangeMeAdmin12",
    });
    expect(response.status).toBe(201);
    return agent;
  }

  async function inviteCashier(admin: Agent, email = "cashier@example.com") {
    return post(admin, "/api/v1/staff", {
      name: "Casey Cashier",
      email,
      role: "CASHIER",
    });
  }

  it("STAFF-01 invitation role is taken from the server, not the accept body", async () => {
    const admin = await loginAdmin();
    const invited = await inviteCashier(admin);
    expect(invited.status).toBe(201);
    expect(invited.body.status).toBe("INVITED");

    const token = auth.extractTokenFromMail(
      (await auth.latestMail("cashier@example.com"))?.textBody,
    );
    const guest = await agentWithCsrf(app);
    const accepted = await post(guest, "/api/v1/auth/invitations/accept", {
      token,
      password: "cashier-pass-12",
      confirmPassword: "cashier-pass-12",
      role: "MANAGER",
    });
    expect(accepted.status).toBe(201);
    expect(accepted.body.role).toBe("CASHIER");

    const publicRegister = await registerCustomer(guest, "newstaff@example.com");
    expect(publicRegister.status).toBe(201);
    expect(publicRegister.body.user.role).toBe("CUSTOMER");
  });

  it("STAFF-02 revoke, resend and expiry invalidate old invitation links", async () => {
    const admin = await loginAdmin();
    const invited = await inviteCashier(admin);
    const firstToken = auth.extractTokenFromMail(
      (await auth.latestMail("cashier@example.com"))?.textBody,
    );
    await post(admin, `/api/v1/staff/${invited.body.id}/resend-invitation`);
    const old = await post(await agentWithCsrf(app), "/api/v1/auth/invitations/accept", {
      token: firstToken,
      password: "cashier-pass-12",
      confirmPassword: "cashier-pass-12",
    });
    expect(old.status).toBe(422);

    const current = auth.extractTokenFromMail(
      (await auth.latestMail("cashier@example.com"))?.textBody,
    );
    await patch(admin, `/api/v1/staff/${invited.body.id}/status`, {
      status: "INVITATION_REVOKED",
      reason: "Left before starting",
    });
    const revoked = await post(await agentWithCsrf(app), "/api/v1/auth/invitations/accept", {
      token: current,
      password: "cashier-pass-12",
      confirmPassword: "cashier-pass-12",
    });
    expect(revoked.status).toBe(422);

    const second = await inviteCashier(admin, "other@example.com");
    await prisma.invitation.updateMany({
      where: { userId: second.body.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const expiredToken = auth.extractTokenFromMail(
      (await auth.latestMail("other@example.com"))?.textBody,
    );
    const expired = await post(await agentWithCsrf(app), "/api/v1/auth/invitations/accept", {
      token: expiredToken,
      password: "cashier-pass-12",
      confirmPassword: "cashier-pass-12",
    });
    expect(expired.status).toBe(422);
  });

  it("STAFF-03 deactivation denies the next request and keeps the actor history", async () => {
    const admin = await loginAdmin();
    const invited = await inviteCashier(admin);
    const token = auth.extractTokenFromMail(
      (await auth.latestMail("cashier@example.com"))?.textBody,
    )!;
    await post(await agentWithCsrf(app), "/api/v1/auth/invitations/accept", {
      token,
      password: "cashier-pass-12",
      confirmPassword: "cashier-pass-12",
    });
    const cashier = await agentWithCsrf(app);
    await post(cashier, "/api/v1/auth/login", {
      email: "cashier@example.com",
      password: "cashier-pass-12",
    });
    expect((await cashier.get("/api/v1/auth/me")).status).toBe(200);

    await patch(admin, `/api/v1/staff/${invited.body.id}/status`, {
      status: "INACTIVE",
      reason: "Left the office",
    });
    expect((await cashier.get("/api/v1/auth/me")).status).toBe(401);
    const events = await prisma.auditEvent.findMany({
      where: { objectId: invited.body.id },
    });
    expect(events.some((event) => event.action === "staff.status_changed")).toBe(true);
    expect(await prisma.user.findUnique({ where: { id: invited.body.id } })).toMatchObject({
      name: "Casey Cashier",
    });
  });

  it("STAFF-04 records role changes, rejects self-elevation and last-admin removal", async () => {
    const admin = await loginAdmin();
    const invited = await inviteCashier(admin);
    const token = auth.extractTokenFromMail(
      (await auth.latestMail("cashier@example.com"))?.textBody,
    )!;
    await post(await agentWithCsrf(app), "/api/v1/auth/invitations/accept", {
      token,
      password: "cashier-pass-12",
      confirmPassword: "cashier-pass-12",
    });
    const cashier = await agentWithCsrf(app);
    await post(cashier, "/api/v1/auth/login", {
      email: "cashier@example.com",
      password: "cashier-pass-12",
    });

    const self = await patch(admin, `/api/v1/staff/${(await admin.get("/api/v1/auth/me")).body.user.id}/role`, {
      role: "MANAGER",
      reason: "I want more power",
    });
    expect(self.status).toBe(403);

    const changed = await patch(admin, `/api/v1/staff/${invited.body.id}/role`, {
      role: "LOAN_OFFICER",
      reason: "Moved to lending",
    });
    expect(changed.status).toBe(200);
    expect((await cashier.get("/api/v1/auth/me")).status).toBe(401);
    const audit = await prisma.auditEvent.findFirst({
      where: { action: "staff.role_changed", objectId: invited.body.id },
    });
    expect(audit?.reason).toBe("Moved to lending");

    const adminUser = await prisma.user.findFirst({
      where: { emailNormalized: "admin@example.com" },
    });
    const last = await patch(admin, `/api/v1/staff/${adminUser!.id}/status`, {
      status: "INACTIVE",
      reason: "oops",
    });
    expect([403, 409]).toContain(last.status);
  });
});
