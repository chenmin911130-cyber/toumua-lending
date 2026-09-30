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
  async function createSubmittedApplication(
    staff: Agent,
    requestedAmount = "600.00",
    valuationAmount = requestedAmount,
  ) {
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
      requestedAmount,
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
        amount: valuationAmount,
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

  it("B04-09 only a manager can approve or decline, for small and large files", async () => {
    const staff = await login("loan@example.com", "LoanOfficer12");
    const small = await createSubmittedApplication(staff, "600.00");

    // A loan officer keeps review visibility but has no decide authority.
    const staffReview = await staff.get(`/api/v1/applications/${small.appId}/review`);
    expect(staffReview.status).toBe(200);
    expect(staffReview.body.canApprove).toBe(false);
    expect(staffReview.body.canDecline).toBe(false);
    expect(staffReview.body.valuationTotal).toBe("600.00");
    expect(staffReview.body.assets[0].valuationAmount).toBe("600.00");
    const staffApproveSmall = await post(staff, `/api/v1/applications/${small.appId}/decision`, {
      expectedVersion: staffReview.body.version,
      decision: "approve",
      reviewed: true,
    });
    expect(staffApproveSmall.status).toBe(403);
    const staffDeclineSmall = await post(staff, `/api/v1/applications/${small.appId}/decision`, {
      expectedVersion: staffReview.body.version,
      decision: "decline",
      reason: "Not my call",
    });
    expect(staffDeclineSmall.status).toBe(403);

    const large = await createSubmittedApplication(staff, "8000.00");
    const largeReview = await staff.get(`/api/v1/applications/${large.appId}/review`);
    expect(largeReview.body.canApprove).toBe(false);
    expect(largeReview.body.canDecline).toBe(false);
    const staffApproveLarge = await post(staff, `/api/v1/applications/${large.appId}/decision`, {
      expectedVersion: largeReview.body.version,
      decision: "approve",
      reviewed: true,
    });
    expect(staffApproveLarge.status).toBe(403);
    const staffDeclineLarge = await post(staff, `/api/v1/applications/${large.appId}/decision`, {
      expectedVersion: largeReview.body.version,
      decision: "decline",
      reason: "Not my call",
    });
    expect(staffDeclineLarge.status).toBe(403);

    // The manager may approve one file and decline the other.
    const manager = await login("manager@example.com", "Manager12345");
    const managerSmall = await manager.get(`/api/v1/applications/${small.appId}/review`);
    expect(managerSmall.body.canApprove).toBe(true);
    expect(managerSmall.body.canDecline).toBe(true);
    const approved = await post(manager, `/api/v1/applications/${small.appId}/decision`, {
      expectedVersion: managerSmall.body.version,
      decision: "approve",
      reviewed: true,
    });
    expect(approved.status).toBe(201);

    const managerLarge = await manager.get(`/api/v1/applications/${large.appId}/review`);
    expect(managerLarge.body.canApprove).toBe(true);
    const declined = await post(manager, `/api/v1/applications/${large.appId}/decision`, {
      expectedVersion: managerLarge.body.version,
      decision: "decline",
      reason: "Security does not cover the amount",
      publicNote: "We could not approve this application.",
    });
    expect(declined.status).toBe(201);
  });

  it("B04-10 a shared key cannot replay another loan's receipt", async () => {
    const firstLoan = await activeLoan();
    const secondLoan = await activeLoan();
    const body = {
      expectedVersion: (await firstLoan.cashier.get(`/api/v1/loans/${firstLoan.loanId}`)).body.version,
      amount: "100.00",
      businessDate: "2026-10-01",
      method: "CASH",
    };
    const first = await postIdempotent(
      firstLoan.cashier,
      `/api/v1/loans/${firstLoan.loanId}/repayments`,
      body,
      "shared-cross-loan-key",
    );
    expect(first.status).toBe(201);

    const secondActive = await secondLoan.cashier.get(`/api/v1/loans/${secondLoan.loanId}`);
    const cross = await postIdempotent(
      secondLoan.cashier,
      `/api/v1/loans/${secondLoan.loanId}/repayments`,
      { ...body, expectedVersion: secondActive.body.version },
      "shared-cross-loan-key",
    );
    expect(cross.status).toBe(409);
    expect(cross.body.message).toMatch(/different loan or payment type/i);
    expect(cross.body.receiptId).toBeUndefined();
    const entries = await prisma.ledgerEntry.count({
      where: { loanId: secondLoan.loanId, type: "REPAYMENT" },
    });
    expect(entries).toBe(0);
  });

  it("B04-11 a shared key cannot be reused for a different operation", async () => {
    const { loanId, cashier } = await activeLoan();
    const active = await cashier.get(`/api/v1/loans/${loanId}`);
    // The disbursement already owns this key; a repayment must not inherit it.
    const cross = await postIdempotent(
      cashier,
      `/api/v1/loans/${loanId}/repayments`,
      {
        expectedVersion: active.body.version,
        amount: "100.00",
        businessDate: "2026-10-01",
        method: "CASH",
      },
      `disburse-${loanId}`,
    );
    expect(cross.status).toBe(409);
    expect(cross.body.message).toMatch(/different loan or payment type/i);
    const entries = await prisma.ledgerEntry.count({
      where: { loanId, type: "REPAYMENT" },
    });
    expect(entries).toBe(0);
  });

  it("B04-12 one cashier cannot replay another cashier's receipt", async () => {
    const { loanId, cashier } = await activeLoan();
    const passwordHash = await auth.hashPassword("Cashier99999");
    await prisma.user.create({
      data: {
        email: "cashier2@example.com",
        emailNormalized: "cashier2@example.com",
        name: "Kara Cashier",
        passwordHash,
        role: "CASHIER",
        status: "ACTIVE",
        emailVerifiedAt: new Date(),
      },
    });
    const cashier2 = await login("cashier2@example.com", "Cashier99999");

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
      "shared-cross-actor-key",
    );
    expect(first.status).toBe(201);

    const cross = await postIdempotent(
      cashier2,
      `/api/v1/loans/${loanId}/repayments`,
      body,
      "shared-cross-actor-key",
    );
    expect(cross.status).toBe(409);
    expect(cross.body.message).toMatch(/another user/i);
    expect(cross.body.receiptId).toBeUndefined();
    const entries = await prisma.ledgerEntry.count({
      where: { loanId, type: "REPAYMENT" },
    });
    expect(entries).toBe(1);
  });

  it("B04-13 two simultaneous sends of one key post once and never 500", async () => {
    const { loanId } = await activeLoan();
    // Two independent sessions for the same cashier, so the concurrency is in
    // the database path rather than in a shared cookie jar.
    const first = await login("cashier@example.com", "Cashier12345");
    const second = await login("cashier@example.com", "Cashier12345");
    const active = await first.get(`/api/v1/loans/${loanId}`);
    const body = {
      expectedVersion: active.body.version,
      amount: "100.00",
      businessDate: "2026-10-01",
      method: "CASH",
    };
    const send = (agent: Agent) =>
      postIdempotent(agent, `/api/v1/loans/${loanId}/repayments`, body, "concurrent-same-key");
    const [a, b] = await allowingSocketFlake(() => Promise.all([send(first), send(second)]));
    const statuses = [a.status, b.status].sort();
    // Exactly one posts; the other replays the stored receipt or is told to
    // retry. A 500 here would mean the unique-violation race escaped unhandled.
    expect(statuses[0]).toBe(201);
    expect([201, 409]).toContain(statuses[1]);
    const entries = await prisma.ledgerEntry.findMany({ where: { loanId, type: "REPAYMENT" } });
    expect(entries).toHaveLength(1);
    expect(entries[0].amount).toBe("-100.00");
  });

  it("B04-10 a disbursement amount cannot be corrected; the method can", async () => {
    const { cashier } = await activeLoan();
    const transactions = await cashier.get("/api/v1/transactions");
    const disbursement = transactions.body.items.find(
      (item: { type: string }) => item.type === "DISBURSEMENT",
    );
    expect(disbursement).toBeTruthy();
    const changed = await post(cashier, "/api/v1/corrections", {
      originalLedgerEntryId: disbursement.id,
      reason: "Wrong amount",
      proposedValues: { amount: "1.00" },
    });
    expect(changed.status).toBe(422);
    const methodOnly = await post(cashier, "/api/v1/corrections", {
      originalLedgerEntryId: disbursement.id,
      reason: "Wrong method",
      proposedValues: { method: "BANK_TRANSFER", externalReference: "XFER-1" },
    });
    expect(methodOnly.status).toBe(201);
  });

  it("B04-11 approval is refused when security valuation does not cover the loan", async () => {
    const staff = await login("loan@example.com", "LoanOfficer12");
    const { appId } = await createSubmittedApplication(staff, "1000.00", "400.00");
    const manager = await login("manager@example.com", "Manager12345");
    const review = await manager.get(`/api/v1/applications/${appId}/review`);
    expect(review.status).toBe(200);
    const covered = review.body.checks.find(
      (check: { id: string }) => check.id === "assets-covered",
    );
    expect(covered.complete).toBe(false);
    expect(review.body.canApprove).toBe(false);
    const refused = await post(manager, `/api/v1/applications/${appId}/decision`, {
      expectedVersion: review.body.version,
      decision: "approve",
      reviewed: true,
    });
    expect(refused.status).toBe(422);
  });
});
