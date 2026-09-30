import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { INestApplication } from "@nestjs/common";
import { Client } from "pg";
import request from "supertest";
import { PrismaService } from "../src/prisma/prisma.service";
import { AuthService } from "../src/auth/auth.service";
import { Permission, normalizeEmail } from "@toumua/contracts";
import { IsolatedTarget, planIsolatedTarget } from "./isolation";

/**
 * Test isolation.
 *
 * These tests TRUNCATE every table, so they must never connect to a developer's
 * real database. `scripts/test-api-isolated.mjs` creates a throwaway PostgreSQL
 * cluster and exports the markers validated below. Validation is offline first
 * (flag, loopback URL, generated name, owned temporary cluster marker) and only
 * then does a separate probe confirm the server reports our generated
 * `data_directory`. That probe runs before the Nest app is created, so a
 * bootstrap write can never land in the wrong database. A bare `pnpm test:api`
 * fails here instead.
 *
 * `create-app` is imported lazily inside `startApp` so this guard executes
 * before the app module (and `@nestjs/config`) is ever evaluated.
 */
let isolatedTarget: IsolatedTarget | null = null;

function refreshIsolatedTarget(): IsolatedTarget {
  isolatedTarget = planIsolatedTarget(process.env);
  return isolatedTarget;
}

// Fail at import time for a bare test run, before any app module is loaded.
refreshIsolatedTarget();

process.env.NODE_ENV = "test";
process.env.MAIL_DRIVER = process.env.MAIL_DRIVER ?? "memory";
process.env.PUBLIC_WEB_URL = process.env.PUBLIC_WEB_URL ?? "http://127.0.0.1:5173";
process.env.BOOTSTRAP_ADMIN_EMAIL = process.env.BOOTSTRAP_ADMIN_EMAIL ?? "admin@example.com";
process.env.BOOTSTRAP_ADMIN_PASSWORD = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "ChangeMeAdmin12";
// Keep uploaded fixtures out of the repository on every test run.
const TEST_UPLOAD_DIR = mkdtempSync(join(tmpdir(), "toumua-uploads-"));
process.env.UPLOAD_DIR = TEST_UPLOAD_DIR;
process.on("exit", () => {
  rmSync(TEST_UPLOAD_DIR, { recursive: true, force: true });
});

export type Agent = ReturnType<typeof request.agent>;

export async function startApp() {
  const target = refreshIsolatedTarget();
  await assertServerOwnsCluster(target);
  const { createApp } = await import("../src/create-app");
  const app = await createApp();
  await app.init();
  const prisma = app.get(PrismaService);
  const auth = app.get(AuthService);
  return { app, prisma, auth };
}

/**
 * Connects to the freshly generated URL only after the offline guard has proved
 * it belongs to the owned temporary cluster, then confirms the server itself
 * reports our generated data directory. This runs before `createApp`, so an app
 * bootstrap write can never land in a database that is not the disposable one.
 */
async function assertServerOwnsCluster(target: IsolatedTarget) {
  const client = new Client({ connectionString: target.databaseUrl });
  await client.connect();
  try {
    const result = await client.query<{ data_directory: string }>("SHOW data_directory");
    const reported = result.rows[0]?.data_directory ?? "";
    const reportedReal = realIfExists(reported);
    const expectedReal = realIfExists(target.dataDir);
    if (!reportedReal || !expectedReal || reportedReal !== expectedReal) {
      throw new Error(
        `Refusing to run API tests: the server data_directory is ` +
          `${reported || "<unknown>"}, not the generated ${target.dataDir}.`,
      );
    }
  } finally {
    await client.end();
  }
}

function realIfExists(path: string): string | null {
  try {
    return realpathSync(path);
  } catch {
    return null;
  }
}

export async function resetDb(prisma: PrismaService) {
  await assertIsolatedDatabase(prisma);
  // CASCADE truncate keeps test resets reliable as the schema grows.
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "CorrectionRequest",
      "Receipt",
      "LedgerEntry",
      "PaymentAttempt",
      "ScheduleEntry",
      "CustodyEvent",
      "ApplicationDecision",
      "Loan",
      "AssetPhoto",
      "Valuation",
      "ApplicationAsset",
      "ApplicationTerms",
      "Application",
      "BorrowerAccountLink",
      "Borrower",
      "SequenceCounter",
      "RateLimitHit",
      "MailMessage",
      "Notification",
      "AuditEvent",
      "StaffPermission",
      "VerificationToken",
      "Session",
      "Invitation",
      "User"
    RESTART IDENTITY CASCADE
  `);
}

/**
 * Confirms the live connection still reports the generated database before every
 * truncate. The offline marker and `data_directory` checks already ran before
 * the app was created; this catches a connection that somehow changed under us.
 */
async function assertIsolatedDatabase(prisma: PrismaService) {
  const target = isolatedTarget ?? refreshIsolatedTarget();
  const rows = await prisma.$queryRawUnsafe<{ name: string }[]>(
    "SELECT current_database() AS name",
  );
  const actual = rows[0]?.name;
  if (actual !== target.databaseName) {
    throw new Error(
      `Refusing to truncate: the server reports database ${actual ?? "<unknown>"}, not the disposable ${target.databaseName}.`,
    );
  }
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

export async function seedManager(prisma: PrismaService, auth: AuthService) {
  const passwordHash = await auth.hashPassword("Manager12345");
  return prisma.user.create({
    data: {
      email: "manager@example.com",
      emailNormalized: "manager@example.com",
      name: "Morgan Manager",
      passwordHash,
      role: "MANAGER",
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

export async function postIdempotent(
  agent: Agent,
  url: string,
  body: unknown,
  idempotencyKey: string,
) {
  const token = await refreshCsrf(agent);
  return agent
    .post(url)
    .set("x-csrf-token", token)
    .set("idempotency-key", idempotencyKey)
    .send(body ?? {});
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
