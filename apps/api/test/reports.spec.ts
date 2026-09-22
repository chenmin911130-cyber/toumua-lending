import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { INestApplication } from "@nestjs/common";
import { BusinessRole } from "@toumua/contracts";
import {
  Agent,
  agentWithCsrf,
  post,
  registerCustomer,
  resetDb,
  seedLoanOfficer,
  seedManager,
  startApp,
} from "./helpers";
import { PrismaService } from "../src/prisma/prisma.service";
import { AuthService } from "../src/auth/auth.service";

describe("business status report", () => {
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

  async function login(email: string, password: string): Promise<Agent> {
    const agent = await agentWithCsrf(app);
    const response = await post(agent, "/api/v1/auth/login", { email, password });
    expect(response.status).toBe(201);
    return agent;
  }

  async function user(email: string, role: BusinessRole | null, password: string) {
    const passwordHash = await auth.hashPassword(password);
    await prisma.user.create({
      data: {
        email,
        emailNormalized: email,
        name: email,
        passwordHash,
        role,
        status: "ACTIVE",
        emailVerifiedAt: new Date(),
      },
    });
  }

  it("returns zeros for an empty book and refuses roles without the report", async () => {
    await user("owner@example.com", BusinessRole.OWNER, "Ownerpass1234");
    await user("accountant@example.com", BusinessRole.ACCOUNTANT, "Account12345");
    await seedManager(prisma, auth);
    await seedLoanOfficer(prisma, auth);
    await user("cashier@example.com", BusinessRole.CASHIER, "Cashier12345");

    const owner = await login("owner@example.com", "Ownerpass1234");
    const report = await owner.get("/api/v1/reports/business-status");
    expect(report.status).toBe(200);
    expect(report.body.loans).toEqual({ active: 0, defaulted: 0, settled: 0, total: 0 });
    expect(report.body.applications).toEqual({ draft: 0, submitted: 0, approved: 0, declined: 0 });
    expect(report.body.money.outstandingPrincipal).toBe("0.00");
    expect(report.body.money.disbursedLast30Days).toBe("0.00");
    expect(report.body.dueToday).toBe(0);
    expect(report.body.overdue).toBe(0);

    const manager = await login("manager@example.com", "Manager12345");
    expect((await manager.get("/api/v1/reports/business-status")).status).toBe(200);
    const accountant = await login("accountant@example.com", "Account12345");
    expect((await accountant.get("/api/v1/reports/business-status")).status).toBe(200);

    const officer = await login("loan@example.com", "LoanOfficer12");
    expect((await officer.get("/api/v1/reports/business-status")).status).toBe(403);
    const cashier = await login("cashier@example.com", "Cashier12345");
    expect((await cashier.get("/api/v1/reports/business-status")).status).toBe(403);

    const guest = await agentWithCsrf(app);
    const registered = await registerCustomer(guest, "report-customer@example.com");
    expect(registered.status).toBe(201);
    const token = auth.extractTokenFromMail(
      (await auth.latestMail("report-customer@example.com"))?.textBody,
    );
    await post(guest, "/api/v1/auth/email/verify", { token });
    await post(guest, "/api/v1/auth/login", {
      email: "report-customer@example.com",
      password: "customer-pass-12",
    });
    expect((await guest.get("/api/v1/reports/business-status")).status).toBe(403);
  });
});
