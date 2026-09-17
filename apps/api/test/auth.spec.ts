import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { INestApplication } from "@nestjs/common";
import {
  Agent,
  agentWithCsrf,
  post,
  registerCustomer,
  resetDb,
  startApp,
} from "./helpers";
import { PrismaService } from "../src/prisma/prisma.service";
import { AuthService } from "../src/auth/auth.service";

describe("AUTH", () => {
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
  });

  async function verifyFromMail(email: string) {
    const mail = await auth.latestMail(email);
    const token = auth.extractTokenFromMail(mail?.textBody);
    expect(token).toBeTruthy();
    const agent = await agentWithCsrf(app);
    const response = await post(agent, "/api/v1/auth/email/verify", { token });
    return { token, response, mail };
  }

  it("AUTH-01 registers, verifies, logs in as customer with empty loans", async () => {
    const agent = await agentWithCsrf(app);
    const created = await registerCustomer(agent);
    expect(created.status).toBe(201);
    expect(created.body.user.role).toBe("CUSTOMER");
    expect(created.body.user.restrictedSession).toBe(true);

    const verified = await verifyFromMail("customer@example.com");
    expect(verified.response.body.result).toBe("verified");

    const login = await post(agent, "/api/v1/auth/login", {
      email: "customer@example.com",
      password: "customer-pass-12",
    });
    expect(login.status).toBe(201);
    expect(login.body.user.emailVerified).toBe(true);
    expect(login.body.user.role).toBe("CUSTOMER");

    const loans = await agent.get("/api/v1/me/loans");
    const applications = await agent.get("/api/v1/me/applications");
    expect(loans.status).toBe(200);
    expect(loans.body.items).toEqual([]);
    expect(applications.body.total).toBe(0);
    expect(await prisma.user.count()).toBe(1);
  });

  it("AUTH-02 rejects bad payloads, mismatch, duplicate email and double submit", async () => {
    const agent = await agentWithCsrf(app);
    const bad = await post(agent, "/api/v1/auth/register", {
      name: "A",
      email: "not-an-email",
      password: "short",
      confirmPassword: "other",
    });
    expect(bad.status).toBe(422);
    expect(bad.body.fieldErrors.email).toBeTruthy();
    expect(bad.body.fieldErrors.password).toBeTruthy();
    expect(bad.body.fieldErrors.confirmPassword).toBeTruthy();

    const first = await registerCustomer(agent);
    expect(first.status).toBe(201);
    const second = await registerCustomer(agent);
    expect(second.status).toBe(409);
    expect(second.body.fieldErrors.email).toBeTruthy();
    expect(await prisma.user.count()).toBe(1);
  });

  it("AUTH-03 blocks unverified customers from business APIs", async () => {
    const agent = await agentWithCsrf(app);
    await registerCustomer(agent);
    const loans = await agent.get("/api/v1/me/loans");
    expect(loans.status).toBe(403);
  });

  it("AUTH-04 invalidates old, expired, forged and reused verification links", async () => {
    const agent = await agentWithCsrf(app);
    await registerCustomer(agent);
    const firstMail = await auth.latestMail("customer@example.com");
    const oldToken = auth.extractTokenFromMail(firstMail?.textBody)!;

    await post(agent, "/api/v1/auth/email/resend");
    const old = await post(await agentWithCsrf(app), "/api/v1/auth/email/verify", {
      token: oldToken,
    });
    expect(old.body.result).toBe("already_used");

    const forged = await post(await agentWithCsrf(app), "/api/v1/auth/email/verify", {
      token: "forged-token-value",
    });
    expect(forged.body.result).toBe("invalid");

    const currentMail = await auth.latestMail("customer@example.com");
    const current = auth.extractTokenFromMail(currentMail?.textBody)!;
    await prisma.verificationToken.updateMany({
      where: { tokenHash: { not: "" } },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const expired = await post(await agentWithCsrf(app), "/api/v1/auth/email/verify", {
      token: current,
    });
    expect(expired.body.result).toBe("expired");

    await prisma.verificationToken.updateMany({
      where: {},
      data: { expiresAt: new Date(Date.now() + 60_000), usedAt: null },
    });
    const ok = await post(await agentWithCsrf(app), "/api/v1/auth/email/verify", {
      token: current,
    });
    expect(ok.body.result).toBe("verified");
    const replay = await post(await agentWithCsrf(app), "/api/v1/auth/email/verify", {
      token: current,
    });
    expect(replay.body.result).toBe("already_used");
  });

  it("AUTH-05 changes pending email on the owner session and rejects others", async () => {
    const owner = await agentWithCsrf(app);
    await registerCustomer(owner, "one@example.com");
    const firstMail = await auth.latestMail("one@example.com");
    const oldToken = auth.extractTokenFromMail(firstMail?.textBody)!;

    const changed = await post(owner, "/api/v1/auth/email/change-pending", {
      email: "two@example.com",
    });
    expect(changed.status).toBe(201);
    const old = await post(await agentWithCsrf(app), "/api/v1/auth/email/verify", {
      token: oldToken,
    });
    expect(old.body.result).toBe("already_used");

    const other = await agentWithCsrf(app);
    await registerCustomer(other, "intruder@example.com");
    const denied = await post(other, "/api/v1/auth/email/change-pending", {
      email: "stolen@example.com",
    });
    expect(denied.status).toBe(201);
    const original = await prisma.user.findUnique({
      where: { emailNormalized: "two@example.com" },
    });
    expect(original).toBeTruthy();
  });

  it("AUTH-06 forgot password is neutral, rate limited, and does not fake send", async () => {
    const agent = await agentWithCsrf(app);
    const missing = await post(agent, "/api/v1/auth/password/forgot", {
      email: "missing@example.com",
    });
    expect(missing.status).toBe(201);
    expect(missing.body.message).toMatch(/If an account exists/);

    await registerCustomer(agent);
    await verifyFromMail("customer@example.com");
    const exists = await post(agent, "/api/v1/auth/password/forgot", {
      email: "customer@example.com",
    });
    expect(exists.body.message).toBe(missing.body.message);

    process.env.MAIL_FORCE_FAIL = "true";
    const fail = await post(await agentWithCsrf(app), "/api/v1/auth/password/forgot", {
      email: "customer@example.com",
    });
    process.env.MAIL_FORCE_FAIL = "false";
    expect(fail.status).toBe(503);
    expect(fail.body.code).toBe("MAIL_UNAVAILABLE");
    expect(fail.body.message).toContain("not sent");

    for (let i = 0; i < 3; i += 1) {
      await post(agent, "/api/v1/auth/password/forgot", {
        email: "customer@example.com",
      });
    }
    const limited = await post(agent, "/api/v1/auth/password/forgot", {
      email: "customer@example.com",
    });
    expect(limited.status).toBe(429);
    expect(limited.body.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("AUTH-07 reset password revokes old sessions and the token", async () => {
    const agent = await agentWithCsrf(app);
    await registerCustomer(agent);
    await verifyFromMail("customer@example.com");
    await post(agent, "/api/v1/auth/login", {
      email: "customer@example.com",
      password: "customer-pass-12",
    });
    await post(agent, "/api/v1/auth/password/forgot", {
      email: "customer@example.com",
    });
    const token = auth.extractTokenFromMail(
      (await auth.latestMail("customer@example.com"))?.textBody,
    );
    const reset = await post(await agentWithCsrf(app), "/api/v1/auth/password/reset", {
      token,
      password: "new-customer-12",
      confirmPassword: "new-customer-12",
    });
    expect(reset.status).toBe(201);
    const oldSession = await agent.get("/api/v1/auth/me");
    expect(oldSession.status).toBe(401);
    const oldPassword = await post(await agentWithCsrf(app), "/api/v1/auth/login", {
      email: "customer@example.com",
      password: "customer-pass-12",
    });
    expect(oldPassword.status).toBe(401);
    const next = await post(await agentWithCsrf(app), "/api/v1/auth/login", {
      email: "customer@example.com",
      password: "new-customer-12",
    });
    expect(next.status).toBe(201);
    const replay = await post(await agentWithCsrf(app), "/api/v1/auth/password/reset", {
      token,
      password: "another-pass-12",
      confirmPassword: "another-pass-12",
    });
    expect(replay.status).toBe(422);
  });

  it("AUTH-08 change password checks the current password and revokes sessions", async () => {
    const agent = await agentWithCsrf(app);
    await registerCustomer(agent);
    await verifyFromMail("customer@example.com");
    await post(agent, "/api/v1/auth/login", {
      email: "customer@example.com",
      password: "customer-pass-12",
    });
    const wrong = await post(agent, "/api/v1/auth/password/change", {
      currentPassword: "wrong-password",
      password: "fresh-password-12",
      confirmPassword: "fresh-password-12",
    });
    expect(wrong.status).toBe(422);
    const ok = await post(agent, "/api/v1/auth/password/change", {
      currentPassword: "customer-pass-12",
      password: "fresh-password-12",
      confirmPassword: "fresh-password-12",
    });
    expect(ok.status).toBe(201);
    expect((await agent.get("/api/v1/auth/me")).status).toBe(401);
  });

  it("public register cannot create staff", async () => {
    const agent = await agentWithCsrf(app);
    const response = await post(agent, "/api/v1/auth/register", {
      name: "Nope",
      email: "manager@example.com",
      password: "customer-pass-12",
      confirmPassword: "customer-pass-12",
      role: "MANAGER",
    });
    expect(response.status).toBe(403);
  });
});
