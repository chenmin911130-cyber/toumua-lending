import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { INestApplication } from "@nestjs/common";
import {
  Agent,
  agentWithCsrf,
  patch,
  post,
  postIdempotent,
  resetDb,
  seedCashier,
  seedLoanOfficer,
  seedManager,
  seedValuationOfficer,
  signContractInBranch,
  startApp,
} from "./helpers";
import { PrismaService } from "../src/prisma/prisma.service";
import { AuthService } from "../src/auth/auth.service";
import { CollectionsService } from "../src/arrangements/collections.service";
import { addCalendarDays, aucklandDay, reminderDaysBefore } from "../src/common/dates";

const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ACCOUNT = "12-3456-1234567-012";

describe("repayment arrangements and collections", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let auth: AuthService;
  let loanOfficerId: string;
  let valuationOfficerId: string;

  beforeAll(async () => {
    process.env.CALCULATION_POLICY = "test";
    process.env.COLLECTION_SIMULATE = "success";
    process.env.SMS_DRIVER = "memory";
    ({ app, prisma, auth } = await startApp());
  });

  afterAll(async () => {
    delete process.env.COLLECTION_SIMULATE;
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    process.env.COLLECTION_SIMULATE = "success";
    loanOfficerId = (await seedLoanOfficer(prisma, auth)).id;
    valuationOfficerId = (await seedValuationOfficer(prisma, auth)).id;
    await seedManager(prisma, auth);
    await seedCashier(prisma, auth);
  });

  async function login(email: string, password: string): Promise<Agent> {
    const agent = await agentWithCsrf(app);
    const response = await post(agent, "/api/v1/auth/login", { email, password });
    expect(response.status).toBe(201);
    return agent;
  }

  async function csrfOf(agent: Agent) {
    return (await agent.get("/api/v1/auth/csrf")).body.token as string;
  }

  async function createSubmittedApplication(staff: Agent) {
    const borrower = await post(staff, "/api/v1/borrowers", {
      name: "Alex Borrower",
      phone: "+64 21 555 0303",
      address: "1 Queen Street, Auckland",
    });
    expect(borrower.status).toBe(201);
    const application = await post(staff, "/api/v1/applications", { borrowerId: borrower.body.id });
    expect(application.status).toBe(201);
    const appId = application.body.id as string;
    const details = await patch(staff, `/api/v1/applications/${appId}`, {
      expectedVersion: application.body.version,
      requestedAmount: "600.00",
      purpose: "Emergency repair",
      proposedTermMonths: 6,
    });
    expect(details.status).toBe(200);
    const withAsset = await post(staff, `/api/v1/applications/${appId}/assets`, {
      name: "Watch",
      description: "Steel wristwatch",
      condition: "Good",
    });
    expect(withAsset.status).toBe(201);
    const assetId = withAsset.body.assets[0].id as string;
    const photo = await staff
      .post(`/api/v1/applications/${appId}/assets/${assetId}/photos`)
      .set("x-csrf-token", await csrfOf(staff))
      .attach("file", PNG_HEADER, { filename: "watch.png", contentType: "image/png" });
    expect(photo.status).toBe(201);
    const latest = await staff.get(`/api/v1/applications/${appId}`);
    const terms = await staff
      .put(`/api/v1/applications/${appId}/terms`)
      .set("x-csrf-token", await csrfOf(staff))
      .send({
        expectedVersion: latest.body.version,
        firstPaymentDate: "2026-10-01",
        frequency: "MONTHLY",
        periods: 6,
      });
    expect(terms.status).toBe(200);
    const valuations = await staff.get(`/api/v1/applications/${appId}/valuations`);
    const valAgent = await login("val@example.com", "Valuation12");
    const completed = await post(valAgent, `/api/v1/valuations/${valuations.body.items[0].id}/complete`, {
      expectedVersion: 1,
      amount: "600.00",
      valuationDate: "2026-09-18",
      basis: "Comparable sales",
      borrowerPresent: true,
      loanOfficerId,
      valuationOfficerId,
      participatedAt: "2026-09-18T10:00:00.000Z",
    });
    expect(completed.status).toBe(201);
    const ready = await staff.get(`/api/v1/applications/${appId}`);
    const submitted = await post(staff, `/api/v1/applications/${appId}/submit`, {
      expectedVersion: ready.body.version,
    });
    expect(submitted.status).toBe(201);
    return { appId, assetId, borrowerId: borrower.body.id as string };
  }

  async function activeLoan() {
    const staff = await login("loan@example.com", "LoanOfficer12");
    const { appId, assetId, borrowerId } = await createSubmittedApplication(staff);
    const manager = await login("manager@example.com", "Manager12345");
    const review = await manager.get(`/api/v1/applications/${appId}/review`);
    const approved = await post(manager, `/api/v1/applications/${appId}/decision`, {
      expectedVersion: review.body.version,
      decision: "approve",
      reviewed: true,
    });
    expect(approved.status).toBe(201);
    const loanId = approved.body.loanId as string;
    const valOfficer = await login("val@example.com", "Valuation12");
    const beforeIntake = await staff.get(`/api/v1/loans/${loanId}`);
    const intake = await post(valOfficer, `/api/v1/assets/${assetId}/intake`, {
      expectedVersion: beforeIntake.body.version,
      receivedOn: "2026-09-18",
      inspectedOn: "2026-09-18",
      inspectionResult: "PASS",
      location: "Vault A",
    });
    expect(intake.status).toBe(201);
    const cashier = await login("cashier@example.com", "Cashier12345");
    await signContractInBranch(staff, loanId);
    const afterSign = await cashier.get(`/api/v1/loans/${loanId}`);
    const disbursed = await postIdempotent(
      cashier,
      `/api/v1/loans/${loanId}/disbursements`,
      { expectedVersion: afterSign.body.version, businessDate: "2026-09-18", method: "CASH" },
      `disburse-${loanId}`,
    );
    expect(disbursed.status).toBe(201);
    return { loanId, borrowerId, cashier, staff, manager };
  }

  const requestBody = {
    method: "BANK_AUTOMATIC_PAYMENT" as const,
    accountName: "Alex Borrower",
    accountNumber: ACCOUNT,
    bankName: "ANZ",
    consent: true as const,
  };

  it("requests, activates, lists and posts one automatic collection", async () => {
    const { loanId, borrowerId, cashier, manager } = await activeLoan();
    const hash = await auth.hashPassword("Borrower12345");
    const customer = await prisma.user.create({
      data: {
        email: "alex@example.com",
        emailNormalized: "alex@example.com",
        name: "Alex Borrower",
        passwordHash: hash,
        role: "CUSTOMER",
        status: "ACTIVE",
        emailVerifiedAt: new Date(),
      },
    });
    await prisma.borrowerAccountLink.create({
      data: { borrowerId, userId: customer.id, status: "ACTIVE", verificationMethod: "test" },
    });
    const owner = await login("alex@example.com", "Borrower12345");
    const requested = await post(owner, `/api/v1/me/loans/${loanId}/arrangements`, requestBody);
    expect(requested.status).toBe(201);
    expect(requested.body.status).toBe("REQUESTED");
    expect(requested.body.accountNumberLast4).toBe("7012");
    expect(JSON.stringify(requested.body)).not.toContain(ACCOUNT);

    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { action: "arrangement.request", objectId: requested.body.id },
    });
    expect(JSON.stringify(audit.after)).not.toContain(ACCOUNT);
    expect(JSON.stringify(audit.after)).toContain("7012");
    const consent = (audit.after as { consent?: { userId?: string; at?: string; how?: string } }).consent;
    expect(consent?.userId).toBe(customer.id);
    expect(consent?.how).toBe("PORTAL");
    expect(consent?.at).toEqual(expect.any(String));
    const stored = await prisma.repaymentArrangement.findUniqueOrThrow({ where: { id: requested.body.id } });
    expect(stored.consentedById).toBe(customer.id);
    expect(stored.consentHow).toBe("PORTAL");
    expect(stored.consentedAt).toBeInstanceOf(Date);

    const duplicate = await post(owner, `/api/v1/me/loans/${loanId}/arrangements`, requestBody);
    expect(duplicate.status).toBe(409);

    const activated = await post(cashier, `/api/v1/arrangements/${requested.body.id}/activate`);
    expect(activated.status).toBe(200);
    expect(activated.body.status).toBe("ACTIVE");

    const again = await post(manager, `/api/v1/loans/${loanId}/arrangements`, requestBody);
    expect(again.status).toBe(409);

    const list = await cashier.get("/api/v1/arrangements/collections?date=2026-11-01");
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].amount).toBe("100.00");
    expect(list.body.items[0].idempotencyKey).toContain("auto:");

    const posted = await post(cashier, `/api/v1/arrangements/collections/${list.body.items[0].scheduleEntryId}/post?date=2026-11-01`, {
      received: true,
    });
    expect(posted.status).toBe(200);
    const entries = await prisma.ledgerEntry.findMany({ where: { loanId, type: "REPAYMENT" } });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.method).toBe("AUTOMATIC_PAYMENT");
    const receipt = await prisma.receipt.findFirstOrThrow({ where: { loanId, ledgerEntryId: entries[0]?.id } });
    expect(receipt.number).toMatch(/^RC-/);

    const replay = await post(cashier, `/api/v1/arrangements/collections/${list.body.items[0].scheduleEntryId}/post?date=2026-11-01`, {
      received: true,
    });
    expect([200, 409]).toContain(replay.status);
    expect(await prisma.ledgerEntry.count({ where: { loanId, type: "REPAYMENT" } })).toBe(1);
  });

  it("a failed bank simulation posts nothing and a retry can succeed", async () => {
    const { loanId, cashier, staff } = await activeLoan();
    const requested = await post(staff, `/api/v1/loans/${loanId}/arrangements`, requestBody);
    expect(requested.status).toBe(201);
    expect((await post(cashier, `/api/v1/arrangements/${requested.body.id}/activate`)).status).toBe(200);
    const list = await cashier.get("/api/v1/arrangements/collections?date=2026-11-01");
    const entryId = list.body.items[0].scheduleEntryId as string;
    process.env.COLLECTION_SIMULATE = "failure";
    const failed = await post(cashier, `/api/v1/arrangements/collections/${entryId}/post?date=2026-11-01`, { received: true });
    expect(failed.status).toBe(409);
    expect(await prisma.ledgerEntry.count({ where: { loanId, type: "REPAYMENT" } })).toBe(0);
    const attempt = await prisma.collectionAttempt.findFirstOrThrow({ where: { scheduleEntryId: entryId } });
    expect(attempt.outcome).toBe("FAILED");
    process.env.COLLECTION_SIMULATE = "success";
    const recovered = await post(cashier, `/api/v1/arrangements/collections/${entryId}/post?date=2026-11-01`, { received: true });
    expect(recovered.status).toBe(200);
    expect(await prisma.ledgerEntry.count({ where: { loanId, type: "REPAYMENT" } })).toBe(1);
  });

  it("two concurrent collections post one payment", async () => {
    const { loanId, cashier, staff } = await activeLoan();
    const requested = await post(staff, `/api/v1/loans/${loanId}/arrangements`, requestBody);
    await post(cashier, `/api/v1/arrangements/${requested.body.id}/activate`);
    const list = await cashier.get("/api/v1/arrangements/collections?date=2026-11-01");
    const entryId = list.body.items[0].scheduleEntryId as string;
    const once = () => post(cashier, `/api/v1/arrangements/collections/${entryId}/post?date=2026-11-01`, { received: true });
    const [first, second] = await Promise.all([once(), once()]);
    expect([first.status, second.status].sort()).toEqual([200, 200]);
    expect(await prisma.ledgerEntry.count({ where: { loanId, type: "REPAYMENT" } })).toBe(1);
  });

  it("rejects a bad account and never stores the full number", async () => {
    const { loanId, staff } = await activeLoan();
    const bad = await post(staff, `/api/v1/loans/${loanId}/arrangements`, {
      ...requestBody,
      accountNumber: "123456",
    });
    expect(bad.status).toBe(422);
    expect(await prisma.repaymentArrangement.count()).toBe(0);
  });

  it("settling or defaulting the loan cancels the arrangement", async () => {
    const { loanId, cashier, staff, manager } = await activeLoan();
    const requested = await post(staff, `/api/v1/loans/${loanId}/arrangements`, requestBody);
    await post(cashier, `/api/v1/arrangements/${requested.body.id}/activate`);
    const current = await cashier.get(`/api/v1/loans/${loanId}`);
    const settled = await postIdempotent(
      cashier,
      `/api/v1/loans/${loanId}/repayments`,
      { expectedVersion: current.body.version, amount: "600.00", businessDate: "2026-10-01", method: "CASH" },
      `settle-${loanId}`,
    );
    expect(settled.status).toBe(201);
    const after = await prisma.repaymentArrangement.findUniqueOrThrow({ where: { id: requested.body.id } });
    expect(after.status).toBe("CANCELLED");
    expect(after.cancelReason).toBe("Loan settled");

    const other = await activeLoan();
    const requestedAgain = await post(other.staff, `/api/v1/loans/${other.loanId}/arrangements`, requestBody);
    await post(other.cashier, `/api/v1/arrangements/${requestedAgain.body.id}/activate`);
    const version = (await other.manager.get(`/api/v1/loans/${other.loanId}`)).body.version as number;
    const failed = await post(manager, `/api/v1/loans/${other.loanId}/default`, {
      expectedVersion: version,
      businessDate: "2026-10-01",
      reason: "Missed payments",
      policyBasis: "Two missed installments",
    });
    expect(failed.status).toBe(201);
    const cancelled = await prisma.repaymentArrangement.findUniqueOrThrow({ where: { id: requestedAgain.body.id } });
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.cancelReason).toBe("Loan defaulted");
    const due = await other.cashier.get("/api/v1/arrangements/collections?date=2026-11-01");
    const still = (due.body.items as Array<{ loanId: string }>).filter((row) => row.loanId === other.loanId);
    expect(still).toHaveLength(0);
  });

  it("refuses loan officer activation and customer collection access", async () => {
    const { loanId, borrowerId, staff } = await activeLoan();
    const requested = await post(staff, `/api/v1/loans/${loanId}/arrangements`, requestBody);
    expect(requested.status).toBe(201);
    const officer = await login("loan@example.com", "LoanOfficer12");
    const denied = await post(officer, `/api/v1/arrangements/${requested.body.id}/activate`);
    expect(denied.status).toBe(403);
    const hash = await auth.hashPassword("Borrower12345");
    const customer = await prisma.user.create({
      data: {
        email: "alex2@example.com",
        emailNormalized: "alex2@example.com",
        name: "Alex Borrower",
        passwordHash: hash,
        role: "CUSTOMER",
        status: "ACTIVE",
        emailVerifiedAt: new Date(),
      },
    });
    await prisma.borrowerAccountLink.create({
      data: { borrowerId, userId: customer.id, status: "ACTIVE", verificationMethod: "test" },
    });
    const owner = await login("alex2@example.com", "Borrower12345");
    const collections = await owner.get("/api/v1/arrangements/collections?date=2026-11-01");
    expect(collections.status).toBe(403);
    const cashier = await login("cashier@example.com", "Cashier12345");
    expect((await post(cashier, `/api/v1/arrangements/${requested.body.id}/activate`)).status).toBe(200);
    const cancelled = await post(owner, `/api/v1/me/loans/${loanId}/arrangements/cancel`, { reason: "Changed bank" });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe("CANCELLED");
    const due = await cashier.get("/api/v1/arrangements/collections?date=2026-11-01");
    expect((due.body.items as Array<{ loanId: string }>).filter((row) => row.loanId === loanId)).toHaveLength(0);
    const installment = await prisma.scheduleEntry.findFirstOrThrow({
      where: { loanId },
      orderBy: { number: "asc" },
    });
    const blocked = await post(cashier, `/api/v1/arrangements/collections/${installment.id}/post?date=2026-11-01`, {
      received: true,
    });
    expect(blocked.status).toBe(409);
  });

  it("refuses a collection larger than the installment and posts nothing", async () => {
    const { loanId, cashier, staff } = await activeLoan();
    const requested = await post(staff, `/api/v1/loans/${loanId}/arrangements`, requestBody);
    await post(cashier, `/api/v1/arrangements/${requested.body.id}/activate`);
    const list = await cashier.get("/api/v1/arrangements/collections?date=2026-11-01");
    const entryId = list.body.items[0].scheduleEntryId as string;
    const tooMuch = await post(cashier, `/api/v1/arrangements/collections/${entryId}/post?date=2026-11-01`, {
      received: true,
      amount: "9999.00",
    });
    expect(tooMuch.status).toBe(422);
    expect(await prisma.ledgerEntry.count({ where: { loanId, type: "REPAYMENT" } })).toBe(0);
  });

  it("keeps the collection cron behind the env flag and NODE_ENV", async () => {
    const { loanId, cashier, staff } = await activeLoan();
    const requested = await post(staff, `/api/v1/loans/${loanId}/arrangements`, requestBody);
    await post(cashier, `/api/v1/arrangements/${requested.body.id}/activate`);
    const entry = await prisma.scheduleEntry.findFirstOrThrow({
      where: { loanId },
      orderBy: { number: "asc" },
    });
    await prisma.scheduleEntry.update({
      where: { id: entry.id },
      data: { dueDate: new Date("2026-09-01T00:00:00.000Z") },
    });
    const collections = app.get(CollectionsService);
    const previousNode = process.env.NODE_ENV;
    delete process.env.COLLECTION_CRON_ENABLED;
    await collections.tick();
    expect(await prisma.ledgerEntry.count({ where: { loanId, type: "REPAYMENT" } })).toBe(0);

    process.env.COLLECTION_CRON_ENABLED = "1";
    await collections.tick();
    expect(await prisma.ledgerEntry.count({ where: { loanId, type: "REPAYMENT" } })).toBe(0);

    process.env.NODE_ENV = "development";
    try {
      await collections.tick();
    } finally {
      process.env.NODE_ENV = previousNode;
      process.env.COLLECTION_CRON_ENABLED = "0";
    }
    expect(await prisma.ledgerEntry.count({ where: { loanId, type: "REPAYMENT" } })).toBe(1);
    expect(await prisma.collectionAttempt.count({ where: { outcome: "COLLECTED" } })).toBe(1);
  });

  it("uses the automatic collection wording for a due-soon reminder", async () => {
    const { loanId, cashier, staff } = await activeLoan();
    const requested = await post(staff, `/api/v1/loans/${loanId}/arrangements`, requestBody);
    await post(cashier, `/api/v1/arrangements/${requested.body.id}/activate`);
    const manager = await login("manager@example.com", "Manager12345");
    const today = aucklandDay();
    const due = addCalendarDays(today, reminderDaysBefore());
    const entry = await prisma.scheduleEntry.findFirstOrThrow({
      where: { loanId },
      orderBy: { number: "asc" },
    });
    await prisma.scheduleEntry.update({
      where: { id: entry.id },
      data: { dueDate: new Date(`${due}T00:00:00.000Z`) },
    });
    const run = await post(manager, "/api/v1/reminders/run", { asOf: today });
    expect(run.status).toBe(200);
    const reminder = await prisma.repaymentReminder.findFirstOrThrow({
      where: { kind: "DUE_SOON" },
      include: { smsMessage: true },
    });
    expect(reminder.smsMessage?.body).toContain("will be collected automatically");
  });
});
