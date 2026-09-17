import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(__dirname, "../../../.env") });
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createApp } from "../src/create-app";
import { PrismaService } from "../src/prisma/prisma.service";
import { AuthService } from "../src/auth/auth.service";
import { Permission, normalizeEmail } from "@toumua/contracts";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://minchen@127.0.0.1:5432/toumua_test";
process.env.MAIL_DRIVER = "memory";
process.env.PUBLIC_WEB_URL = "http://127.0.0.1:5173";
process.env.BOOTSTRAP_ADMIN_EMAIL = "admin@example.com";
process.env.BOOTSTRAP_ADMIN_PASSWORD = "ChangeMeAdmin12";

export type Agent = ReturnType<typeof request.agent>;

export async function startApp() {
  const app = await createApp();
  await app.init();
  const prisma = app.get(PrismaService);
  const auth = app.get(AuthService);
  return { app, prisma, auth };
}

export async function resetDb(prisma: PrismaService) {
  await prisma.assetPhoto.deleteMany();
  await prisma.valuation.deleteMany();
  await prisma.applicationAsset.deleteMany();
  await prisma.applicationTerms.deleteMany();
  await prisma.application.deleteMany();
  await prisma.borrowerAccountLink.deleteMany();
  await prisma.borrower.deleteMany();
  await prisma.sequenceCounter.deleteMany();
  await prisma.rateLimitHit.deleteMany();
  await prisma.mailMessage.deleteMany();
  await prisma.auditEvent.deleteMany();
  await prisma.staffPermission.deleteMany();
  await prisma.verificationToken.deleteMany();
  await prisma.session.deleteMany();
  await prisma.invitation.deleteMany();
  await prisma.user.deleteMany();
}

export async function seedAdmin(prisma: PrismaService, auth: AuthService) {
  const passwordHash = await auth.hashPassword("ChangeMeAdmin12");
  return prisma.user.create({
    data: {
      email: "admin@example.com",
      emailNormalized: "admin@example.com",
      name: "Workspace Admin",
      passwordHash,
      role: null,
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
      permissions: {
        create: [
          { permission: Permission.MANAGE_STAFF },
          { permission: Permission.VIEW_AUDIT },
        ],
      },
    },
  });
}

export async function seedLoanOfficer(prisma: PrismaService, auth: AuthService) {
  const passwordHash = await auth.hashPassword("LoanOfficer12");
  return prisma.user.create({
    data: {
      email: "loan@example.com",
      emailNormalized: "loan@example.com",
      name: "Louise Loan Officer",
      passwordHash,
      role: "LOAN_OFFICER",
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
    },
  });
}

export async function seedValuationOfficer(prisma: PrismaService, auth: AuthService) {
  const passwordHash = await auth.hashPassword("Valuation12");
  return prisma.user.create({
    data: {
      email: "val@example.com",
      emailNormalized: "val@example.com",
      name: "Vera Valuation Officer",
      passwordHash,
      role: "VALUATION_OFFICER",
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
    },
  });
}

export async function seedCashier(prisma: PrismaService, auth: AuthService) {
  const passwordHash = await auth.hashPassword("Cashier12345");
  return prisma.user.create({
    data: {
      email: "cashier@example.com",
      emailNormalized: "cashier@example.com",
      name: "Cara Cashier",
      passwordHash,
      role: "CASHIER",
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
    },
  });
}

export async function agentWithCsrf(app: INestApplication): Promise<Agent> {
  const agent = request.agent(app.getHttpServer());
  await agent.get("/api/v1/auth/csrf").expect(200);
  return agent;
}

export function csrf(agent: Agent) {
  const token = (agent.jar.getCookie("toumua.csrf", {
    path: "/",
    domain: "127.0.0.1",
  }) ?? agent.jar.getCookies("http://127.0.0.1").find((c) => c.key === "toumua.csrf")) as
    | { value?: string }
    | undefined;
  return token?.value ?? "";
}

export async function post(agent: Agent, url: string, body?: unknown) {
  const token = await refreshCsrf(agent);
  return agent.post(url).set("x-csrf-token", token).send(body ?? {});
}

export async function patch(agent: Agent, url: string, body?: unknown) {
  const token = await refreshCsrf(agent);
  return agent.patch(url).set("x-csrf-token", token).send(body ?? {});
}

async function refreshCsrf(agent: Agent) {
  const response = await agent.get("/api/v1/auth/csrf");
  return response.body.token as string;
}

export async function registerCustomer(
  agent: Agent,
  email = "customer@example.com",
) {
  return post(agent, "/api/v1/auth/register", {
    name: "Ava Customer",
    email,
    password: "customer-pass-12",
    confirmPassword: "customer-pass-12",
  });
}

export { normalizeEmail };
