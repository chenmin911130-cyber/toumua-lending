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
  startApp,
} from "./helpers";
import { PrismaService } from "../src/prisma/prisma.service";
import { AuthService } from "../src/auth/auth.service";

const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("BATCH 04 approval, intake, disbursement, repayment", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let auth: AuthService;
  let loanOfficerId: string;
  let valuationOfficerId: string;

  beforeAll(async () => {
    process.env.CALCULATION_POLICY = "test";
    ({ app, prisma, auth } = await startApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
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

  /**
   * supertest's in-process server occasionally resets a socket when two
   * requests really are in flight at once. Retry only that transport artefact,
   * so the assertions stay about the money behaviour.
   */
  async function allowingSocketFlake<T>(run: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await run();
      } catch (error) {
        const code = (error as { code?: string }).code;
        const retryable = code === "ECONNRESET" || code === "ECONNREFUSED" || code === "EPIPE";
        if (!retryable || attempt >= 3) throw error;
      }
    }
  }

  /**
   * Drives an application from empty draft to SUBMITTED. Every step is
   * asserted: an unasserted failure here used to surface much later as a
   * confusing "application was not submitted" conflict.
   */
  async function createSubmittedApplication(staff: Agent) {
    const borrower = await post(staff, "/api/v1/borrowers", {
      name: "Alex Borrower",
      phone: "+64 21 555 0303",
      address: "1 Queen Street, Auckland",
    });
    expect(borrower.status).toBe(201);
    const application = await post(staff, "/api/v1/applications", {
      borrowerId: borrower.body.id,
    });
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
    const completed = await post(
      valAgent,
      `/api/v1/valuations/${valuations.body.items[0].id}/complete`,
      {
        expectedVersion: 1,
        amount: "400.00",
        valuationDate: "2026-09-18",
        basis: "Comparable sales",
        borrowerPresent: true,
        loanOfficerId,
        valuationOfficerId,
        participatedAt: "2026-09-18T10:00:00.000Z",
      },
    );
    expect(completed.status).toBe(201);

    const ready = await staff.get(`/api/v1/applications/${appId}`);
    const submitted = await post(staff, `/api/v1/applications/${appId}/submit`, {
      expectedVersion: ready.body.version,
    });
    expect(submitted.status).toBe(201);
    expect(submitted.body.status).toBe("SUBMITTED");
    return { appId, assetId };
  }

  /** Approves, stores the asset and disburses, leaving an ACTIVE loan. */
  async function activeLoan() {
    const staff = await login("loan@example.com", "LoanOfficer12");
    const { appId, assetId } = await createSubmittedApplication(staff);
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
    expect(intake.body.status).toBe("STORED");

    const cashier = await login("cashier@example.com", "Cashier12345");
    const forDisburse = await cashier.get(`/api/v1/loans/${loanId}`);
    const disbursed = await postIdempotent(
      cashier,
      `/api/v1/loans/${loanId}/disbursements`,
      { expectedVersion: forDisburse.body.version, businessDate: "2026-09-18", method: "CASH" },
      `disburse-${loanId}`,
    );
    expect(disbursed.status).toBe(201);
    return { loanId, cashier, staff };
  }

  it("B04-01 approve, intake, disburse and repay with idempotency", async () => {
    const staff = await login("loan@example.com", "LoanOfficer12");
    const { appId, assetId } = await createSubmittedApplication(staff);

    const manager = await login("manager@example.com", "Manager12345");
    const review = await manager.get(`/api/v1/applications/${appId}/review`);
    expect(review.status).toBe(200);
    expect(review.body.canApprove).toBe(true);

    const approved = await post(manager, `/api/v1/applications/${appId}/decision`, {
      expectedVersion: review.body.version,
      decision: "approve",
      reviewed: true,
    });
    expect(approved.status).toBe(201);
    const loanId = approved.body.loanId as string;

    const valOfficer = await login("val@example.com", "Valuation12");
    const loanBeforeIntake = await staff.get(`/api/v1/loans/${loanId}`);
    const intake = await post(valOfficer, `/api/v1/assets/${assetId}/intake`, {
      expectedVersion: loanBeforeIntake.body.version,
      receivedOn: "2026-09-18",
      inspectedOn: "2026-09-18",
      inspectionResult: "PASS",
      location: "Vault A",
    });
    expect(intake.status).toBe(201);
    expect(intake.body.status).toBe("STORED");

    const readiness = await staff.get(`/api/v1/loans/${loanId}/disbursement-readiness`);
    expect(readiness.body.ready).toBe(true);

    const cashier = await login("cashier@example.com", "Cashier12345");
    const loanForDisburse = await cashier.get(`/api/v1/loans/${loanId}`);
    const disbursed = await postIdempotent(
      cashier,
      `/api/v1/loans/${loanId}/disbursements`,
      {
        expectedVersion: loanForDisburse.body.version,
        businessDate: "2026-09-18",
        method: "CASH",
      },
      "disburse-key-1",
    );
    expect(disbursed.status).toBe(201);
    expect(disbursed.body.receiptNumber).toMatch(/^RC-/);

    const replay = await postIdempotent(
      cashier,
      `/api/v1/loans/${loanId}/disbursements`,
      {
        expectedVersion: loanForDisburse.body.version,
        businessDate: "2026-09-18",
        method: "CASH",
      },
      "disburse-key-1",
    );
    expect(replay.status).toBe(201);
    expect(replay.body.receiptId).toBe(disbursed.body.receiptId);

    const activeLoanRow = await cashier.get(`/api/v1/loans/${loanId}`);
    expect(activeLoanRow.body.status).toBe("ACTIVE");

    const repayment = await postIdempotent(
      cashier,
      `/api/v1/loans/${loanId}/repayments`,
      {
        expectedVersion: activeLoanRow.body.version,
        amount: "100.00",
        businessDate: "2026-10-01",
        method: "CASH",
      },
      "repay-key-1",
    );
    expect(repayment.status).toBe(201);
    expect(repayment.body.balanceAfter).toBe("500.00");

    const txs = await staff.get("/api/v1/transactions");
    expect(txs.body.total).toBeGreaterThanOrEqual(2);
  });

  it("B04-02 decline keeps the internal reason out of the public note", async () => {
    const staff = await login("loan@example.com", "LoanOfficer12");
    const { appId } = await createSubmittedApplication(staff);
    const manager = await login("manager@example.com", "Manager12345");
    const review = await manager.get(`/api/v1/applications/${appId}/review`);
    const declined = await post(manager, `/api/v1/applications/${appId}/decision`, {
      expectedVersion: review.body.version,
      decision: "decline",
      reason: "Internal note",
      publicNote: "We could not approve this application.",
    });
    expect(declined.status).toBe(201);
    expect(declined.body.outcome).toBe("DECLINED");

    const decision = await prisma.applicationDecision.findFirstOrThrow({
      where: { applicationId: appId },
    });
    expect(decision.reason).toBe("Internal note");
    expect(decision.publicNote).toBe("We could not approve this application.");
  });

  it("B04-03 a repayment replay returns the original receipt", async () => {
    const { loanId, cashier } = await activeLoan();
    const active = await cashier.get(`/api/v1/loans/${loanId}`);
    const body = {
      expectedVersion: active.body.version,
      amount: "100.00",
      businessDate: "2026-10-01",
      method: "CASH",
    };
    const first = await postIdempotent(
      cashier,
      `/api/v1/loans/${loanId}/repayments`,
      body,
      "repay-replay-1",
    );
    expect(first.status).toBe(201);
    expect(first.body.balanceAfter).toBe("500.00");

    // Resending the same key must replay the original result, not re-allocate
    // and not fail because the loan has moved on since the first attempt.
    const replay = await postIdempotent(
      cashier,
      `/api/v1/loans/${loanId}/repayments`,
      body,
      "repay-replay-1",
    );
    expect(replay.status).toBe(201);
    expect(replay.body.receiptId).toBe(first.body.receiptId);
    expect(replay.body.balanceAfter).toBe("500.00");

    const entries = await prisma.ledgerEntry.findMany({
      where: { loanId, type: "REPAYMENT" },
    });
    expect(entries).toHaveLength(1);
  });

  it("B04-04 two concurrent repayments cannot lose one payment", async () => {
    const { loanId, cashier } = await activeLoan();
    const active = await cashier.get(`/api/v1/loans/${loanId}`);
    const version = active.body.version as number;
    const post100 = (key: string) =>
      postIdempotent(
        cashier,
        `/api/v1/loans/${loanId}/repayments`,
        { expectedVersion: version, amount: "100.00", businessDate: "2026-10-01", method: "CASH" },
        key,
      );
    const [first, second] = await allowingSocketFlake(() =>
      Promise.all([post100("conc-key-1"), post100("conc-key-2")]),
    );

    // Exactly one caller may claim the version. The loser must be told to
    // reload, because two payments reaching the ledger while only one reduces
    // the balance would silently lose the customer's money.
    expect([first.status, second.status].sort()).toEqual([201, 409]);

    const after = await cashier.get(`/api/v1/loans/${loanId}`);
    expect(after.body.balance).toBe("500.00");
    const entries = await prisma.ledgerEntry.findMany({
      where: { loanId, type: "REPAYMENT" },
    });
    expect(entries).toHaveLength(1);

    const schedule = await prisma.scheduleEntry.findMany({
      where: { loanId },
      orderBy: { number: "asc" },
    });
    expect(schedule.map((row) => row.paidAmount)).toEqual([
      "100.00",
      "0.00",
      "0.00",
      "0.00",
      "0.00",
      "0.00",
    ]);
  });

  it("B04-05 a failed inspection keeps the loan unfundable", async () => {
    const staff = await login("loan@example.com", "LoanOfficer12");
    const { appId, assetId } = await createSubmittedApplication(staff);
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
    const before = await staff.get(`/api/v1/loans/${loanId}`);
    const failed = await post(valOfficer, `/api/v1/assets/${assetId}/intake`, {
      expectedVersion: before.body.version,
      receivedOn: "2026-09-18",
      inspectedOn: "2026-09-18",
      inspectionResult: "FAIL",
      inspectionNote: "Serial number does not match the valuation",
    });
    expect(failed.status).toBe(201);
    expect(failed.body.status).toBe("VALUED");

    const readiness = await staff.get(`/api/v1/loans/${loanId}/disbursement-readiness`);
    expect(readiness.body.ready).toBe(false);

    const cashier = await login("cashier@example.com", "Cashier12345");
    const loan = await cashier.get(`/api/v1/loans/${loanId}`);
    const blocked = await postIdempotent(
      cashier,
      `/api/v1/loans/${loanId}/disbursements`,
      { expectedVersion: loan.body.version, businessDate: "2026-09-18", method: "CASH" },
      "disburse-after-fail",
    );
    expect(blocked.status).toBe(422);
  });

  it("B04-06 overpayment is refused and records nothing", async () => {
    const { loanId, cashier } = await activeLoan();
    const active = await cashier.get(`/api/v1/loans/${loanId}`);
    const tooMuch = await postIdempotent(
      cashier,
      `/api/v1/loans/${loanId}/repayments`,
      {
        expectedVersion: active.body.version,
        amount: "700.00",
        businessDate: "2026-10-01",
        method: "CASH",
      },
      "repay-overpay-1",
    );
    expect(tooMuch.status).toBe(422);
    const entries = await prisma.ledgerEntry.findMany({
      where: { loanId, type: "REPAYMENT" },
    });
    expect(entries).toHaveLength(0);
  });

  it("B04-07 staff can open a receipt from a transaction row", async () => {
    const { loanId, cashier } = await activeLoan();
    const active = await cashier.get(`/api/v1/loans/${loanId}`);
    const repaid = await postIdempotent(
      cashier,
      `/api/v1/loans/${loanId}/repayments`,
      {
        expectedVersion: active.body.version,
        amount: "100.00",
        businessDate: "2026-10-01",
        method: "CASH",
      },
      "receipt-key-1",
    );
    expect(repaid.status).toBe(201);

    // The transaction row links to the receipt; that route must resolve.
    const transactions = await cashier.get("/api/v1/transactions");
    const row = transactions.body.items.find(
      (item: { receiptId: string | null }) => item.receiptId,
    );
    expect(row).toBeTruthy();
    const receipt = await cashier.get(`/api/v1/receipts/${row.receiptId}`);
    expect(receipt.status).toBe(200);
    expect(receipt.body.number).toBe(repaid.body.receiptNumber);
    expect(receipt.body.summary.balanceAfter).toBe("500.00");
  });

  it("B04-08 a role without money authority cannot post a repayment", async () => {
    const { loanId } = await activeLoan();
    const valOfficer = await login("val@example.com", "Valuation12");
    const loan = await valOfficer.get(`/api/v1/loans/${loanId}`);
    const refused = await postIdempotent(
      valOfficer,
      `/api/v1/loans/${loanId}/repayments`,
      {
        expectedVersion: loan.body.version,
        amount: "100.00",
        businessDate: "2026-10-01",
        method: "CASH",
      },
      "repay-wrong-role",
    );
    expect(refused.status).toBe(403);
  });
});
