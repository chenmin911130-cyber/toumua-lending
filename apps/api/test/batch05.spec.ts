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

describe("BATCH 05 default, return, sale, corrections", () => {
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
   * The in-process HTTP server that supertest drives occasionally resets a
   * socket when two requests really are in flight at once. That is a transport
   * artefact, not the behaviour under test, so retry only on socket errors.
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

  async function createSubmittedApplication(staff: Agent) {
    const borrower = await post(staff, "/api/v1/borrowers", {
      name: "Alex Borrower",
      phone: "+64 21 555 0303",
      address: "1 Queen Street, Auckland",
    });
    const application = await post(staff, "/api/v1/applications", {
      borrowerId: borrower.body.id,
    });
    const appId = application.body.id as string;
    await patch(staff, `/api/v1/applications/${appId}`, {
      expectedVersion: application.body.version,
      requestedAmount: "600.00",
      purpose: "Emergency repair",
      proposedTermMonths: 6,
    });
    const withAsset = await post(staff, `/api/v1/applications/${appId}/assets`, {
      name: "Watch",
      description: "Steel wristwatch",
      condition: "Good",
    });
    const assetId = withAsset.body.assets[0].id as string;
    await staff
      .post(`/api/v1/applications/${appId}/assets/${assetId}/photos`)
      .set("x-csrf-token", await csrfOf(staff))
      .attach("file", PNG_HEADER, { filename: "watch.png", contentType: "image/png" });
    const latest = await staff.get(`/api/v1/applications/${appId}`);
    await staff
      .put(`/api/v1/applications/${appId}/terms`)
      .set("x-csrf-token", await csrfOf(staff))
      .send({
        expectedVersion: latest.body.version,
        firstPaymentDate: "2026-10-01",
        frequency: "MONTHLY",
        periods: 6,
      });
    const valuations = await staff.get(`/api/v1/applications/${appId}/valuations`);
    const valAgent = await login("val@example.com", "Valuation12");
    await post(valAgent, `/api/v1/valuations/${valuations.body.items[0].id}/complete`, {
      expectedVersion: 1,
      amount: "400.00",
      valuationDate: "2026-09-18",
      basis: "Comparable sales",
      borrowerPresent: true,
      loanOfficerId,
      valuationOfficerId,
      participatedAt: "2026-09-18T10:00:00.000Z",
    });
    const ready = await staff.get(`/api/v1/applications/${appId}`);
    await post(staff, `/api/v1/applications/${appId}/submit`, {
      expectedVersion: ready.body.version,
    });
    return { appId, assetId, staff };
  }

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
    const loanId = approved.body.loanId as string;
    const valOfficer = await login("val@example.com", "Valuation12");
    const beforeIntake = await staff.get(`/api/v1/loans/${loanId}`);
    await post(valOfficer, `/api/v1/assets/${assetId}/intake`, {
      expectedVersion: beforeIntake.body.version,
      receivedOn: "2026-09-18",
      inspectedOn: "2026-09-18",
      inspectionResult: "PASS",
      location: "Vault A",
    });
    const cashier = await login("cashier@example.com", "Cashier12345");
    const forDisburse = await cashier.get(`/api/v1/loans/${loanId}`);
    await postIdempotent(
      cashier,
      `/api/v1/loans/${loanId}/disbursements`,
      { expectedVersion: forDisburse.body.version, businessDate: "2026-09-18", method: "CASH" },
      `disburse-${loanId}`,
    );
    return { loanId, assetId, cashier, staff, mgr: manager, val: valOfficer };
  }

  it("B05-01 default, sale and sale proceeds", async () => {
    const { loanId, assetId, cashier, staff } = await activeLoan();
    const manager = await login("manager@example.com", "Manager12345");
    const active = await staff.get(`/api/v1/loans/${loanId}`);
    const defaulted = await post(manager, `/api/v1/loans/${loanId}/default`, {
      expectedVersion: active.body.version,
      businessDate: "2026-09-20",
      reason: "Missed installments",
      policyBasis: "Office default policy clause 4",
    });
    expect(defaulted.status).toBe(201);
    expect(defaulted.body.status).toBe("DEFAULTED");

    const valOfficer = await login("val@example.com", "Valuation12");
    const loanAfterDefault = await staff.get(`/api/v1/loans/${loanId}`);
    const sale = await post(valOfficer, `/api/v1/assets/${assetId}/sale`, {
      expectedVersion: loanAfterDefault.body.version,
      buyerName: "Second-hand dealer",
      buyerContact: "+64 21 555 0404",
      saleAmount: "350.00",
      saleDate: "2026-09-21",
      method: "Private sale",
      notes: "Sold at auction preview",
    });
    expect(sale.status).toBe(201);
    expect(sale.body.status).toBe("SOLD");

    const forReceipt = await cashier.get(`/api/v1/loans/${loanId}`);
    const receipt = await postIdempotent(
      cashier,
      `/api/v1/loans/${loanId}/sale-receipts`,
      {
        expectedVersion: forReceipt.body.version,
        amount: "350.00",
        businessDate: "2026-09-21",
        method: "CASH",
      },
      "sale-receipt-1",
    );
    expect(receipt.status).toBe(201);
    expect(receipt.body.balanceAfter).toBe("250.00");
  });

  it("B05-02 return after full repayment", async () => {
    const { loanId, assetId, cashier } = await activeLoan();
    const active = await cashier.get(`/api/v1/loans/${loanId}`);
    await postIdempotent(
      cashier,
      `/api/v1/loans/${loanId}/repayments`,
      {
        expectedVersion: active.body.version,
        amount: "600.00",
        businessDate: "2026-10-01",
        method: "CASH",
      },
      "full-repay",
    );
    const valOfficer = await login("val@example.com", "Valuation12");
    const settled = await cashier.get(`/api/v1/loans/${loanId}`);
    expect(settled.body.status).toBe("SETTLED");
    const returned = await post(valOfficer, `/api/v1/assets/${assetId}/return`, {
      expectedVersion: settled.body.version,
      returnedOn: "2026-10-02",
      recipientName: "Alex Borrower",
      verificationMethod: "Photo ID checked",
      identityConfirmed: true,
    });
    expect(returned.status).toBe(201);
    expect(returned.body.status).toBe("RETURNED");
  });

  it("B05-03 correction request approve and post", async () => {
    const { loanId, cashier } = await activeLoan();
    const active = await cashier.get(`/api/v1/loans/${loanId}`);
    const repayment = await postIdempotent(
      cashier,
      `/api/v1/loans/${loanId}/repayments`,
      {
        expectedVersion: active.body.version,
        amount: "100.00",
        businessDate: "2026-10-01",
        method: "CASH",
      },
      "repay-for-correction",
    );
    const requested = await post(cashier, "/api/v1/corrections", {
      originalLedgerEntryId: repayment.body.ledgerEntryId as string,
      reason: "Wrong amount entered at counter",
      proposedValues: {
        amount: "120.00",
        businessDate: "2026-10-01",
        method: "CASH",
      },
    });
    expect(requested.status).toBe(201);
    expect(requested.body.status).toBe("REQUESTED");

    const manager = await login("manager@example.com", "Manager12345");
    const approved = await post(manager, `/api/v1/corrections/${requested.body.id}/decision`, {
      expectedVersion: requested.body.version,
      decision: "approve",
    });
    expect(approved.status).toBe(201);
    expect(approved.body.status).toBe("APPROVED");

    const posted = await postIdempotent(
      cashier,
      `/api/v1/corrections/${requested.body.id}/post`,
      {},
      "correction-post-1",
    );
    expect(posted.status).toBe(201);
    expect(posted.body.status).toBe("POSTED");
    expect(posted.body.reversalEntryId).toBeTruthy();
    expect(posted.body.replacementEntryId).toBeTruthy();
  });

  it("B05-04 return blocked with outstanding balance", async () => {
    const { loanId, assetId } = await activeLoan();
    const valOfficer = await login("val@example.com", "Valuation12");
    const loan = await valOfficer.get(`/api/v1/loans/${loanId}`);
    const blocked = await post(valOfficer, `/api/v1/assets/${assetId}/return`, {
      expectedVersion: loan.body.version,
      returnedOn: "2026-10-02",
      recipientName: "Alex Borrower",
      verificationMethod: "Photo ID checked",
      identityConfirmed: true,
    });
    expect(blocked.status).toBe(422);
  });

  it("B05-05 sale blocked without default", async () => {
    const { loanId, assetId } = await activeLoan();
    const valOfficer = await login("val@example.com", "Valuation12");
    const loan = await valOfficer.get(`/api/v1/loans/${loanId}`);
    const blocked = await post(valOfficer, `/api/v1/assets/${assetId}/sale`, {
      expectedVersion: loan.body.version,
      buyerName: "Dealer",
      buyerContact: "+64 21 555 0404",
      saleAmount: "350.00",
      saleDate: "2026-09-21",
      method: "Private sale",
    });
    expect(blocked.status).toBe(422);
  });

  it("B05-07 a posted correction moves the balance, the plan and the status", async () => {
    const { loanId, cashier } = await activeLoan();
    const active = await cashier.get(`/api/v1/loans/${loanId}`);
    const repayment = await postIdempotent(
      cashier,
      `/api/v1/loans/${loanId}/repayments`,
      {
        expectedVersion: active.body.version,
        amount: "100.00",
        businessDate: "2026-10-01",
        method: "CASH",
      },
      "repay-correct-1",
    );
    expect(repayment.body.balanceAfter).toBe("500.00");

    const requested = await post(cashier, "/api/v1/corrections", {
      originalLedgerEntryId: repayment.body.ledgerEntryId,
      reason: "Wrong amount entered at counter",
      proposedValues: { amount: "120.00", businessDate: "2026-10-01", method: "CASH" },
    });
    const manager = await login("manager@example.com", "Manager12345");
    const approved = await post(manager, `/api/v1/corrections/${requested.body.id}/decision`, {
      expectedVersion: requested.body.version,
      decision: "approve",
    });
    expect(approved.status).toBe(201);
    const posted = await postIdempotent(
      cashier,
      `/api/v1/corrections/${requested.body.id}/post`,
      {},
      "correction-post-amount",
    );
    expect(posted.status).toBe(201);

    // The ledger alone is not enough: the loan balance and the plan must move.
    const after = await cashier.get(`/api/v1/loans/${loanId}`);
    expect(after.body.balance).toBe("480.00");
    const schedule = await prisma.scheduleEntry.findMany({
      where: { loanId },
      orderBy: { number: "asc" },
    });
    const planPaid = schedule.reduce((total, row) => total + Math.round(Number(row.paidAmount) * 100), 0);
    expect(planPaid).toBe(12000);
  });

  it("B05-08 correcting a settled loan downward reopens it and blocks return", async () => {
    const { loanId, assetId, cashier } = await activeLoan();
    const active = await cashier.get(`/api/v1/loans/${loanId}`);
    const full = await postIdempotent(
      cashier,
      `/api/v1/loans/${loanId}/repayments`,
      {
        expectedVersion: active.body.version,
        amount: "600.00",
        businessDate: "2026-10-01",
        method: "CASH",
      },
      "repay-settle-1",
    );
    const settled = await cashier.get(`/api/v1/loans/${loanId}`);
    expect(settled.body.status).toBe("SETTLED");

    const requested = await post(cashier, "/api/v1/corrections", {
      originalLedgerEntryId: full.body.ledgerEntryId,
      reason: "Overstated the amount taken at the counter",
      proposedValues: { amount: "540.00" },
    });
    const manager = await login("manager@example.com", "Manager12345");
    await post(manager, `/api/v1/corrections/${requested.body.id}/decision`, {
      expectedVersion: requested.body.version,
      decision: "approve",
    });
    const posted = await postIdempotent(
      cashier,
      `/api/v1/corrections/${requested.body.id}/post`,
      {},
      "correction-reopen",
    );
    expect(posted.status).toBe(201);

    const reopened = await cashier.get(`/api/v1/loans/${loanId}`);
    expect(reopened.body.status).toBe("ACTIVE");
    expect(reopened.body.balance).toBe("60.00");

    // A reopened debt must not let the collateral walk out of the vault.
    const valOfficer = await login("val@example.com", "Valuation12");
    const blocked = await post(valOfficer, `/api/v1/assets/${assetId}/return`, {
      expectedVersion: reopened.body.version,
      returnedOn: "2026-10-02",
      recipientName: "Alex Borrower",
      verificationMethod: "Photo ID checked",
      identityConfirmed: true,
    });
    expect(blocked.status).toBe(422);
  });

  it("B05-09 a correction cannot invent money beyond the outstanding balance", async () => {
    const { loanId, cashier } = await activeLoan();
    const active = await cashier.get(`/api/v1/loans/${loanId}`);
    const repayment = await postIdempotent(
      cashier,
      `/api/v1/loans/${loanId}/repayments`,
      {
        expectedVersion: active.body.version,
        amount: "100.00",
        businessDate: "2026-10-01",
        method: "CASH",
      },
      "repay-overcorrect",
    );
    // The plan only ever held 100 of this payment, so a replacement of 1000 has
    // nowhere to go and must be refused rather than absorbed.
    const requested = await post(cashier, "/api/v1/corrections", {
      originalLedgerEntryId: repayment.body.ledgerEntryId,
      reason: "Fat finger",
      proposedValues: { amount: "1000.00" },
    });
    expect(requested.status).toBe(201);
    const manager = await login("manager@example.com", "Manager12345");
    await post(manager, `/api/v1/corrections/${requested.body.id}/decision`, {
      expectedVersion: requested.body.version,
      decision: "approve",
    });
    const posted = await postIdempotent(
      cashier,
      `/api/v1/corrections/${requested.body.id}/post`,
      {},
      "correction-overcorrect",
    );
    expect(posted.status).toBe(422);

    // The failed post left the loan exactly as it was.
    const after = await cashier.get(`/api/v1/loans/${loanId}`);
    expect(after.body.balance).toBe("500.00");
  });

  it("B05-10 two simultaneous decisions cannot both land", async () => {
    const { loanId, cashier } = await activeLoan();
    const active = await cashier.get(`/api/v1/loans/${loanId}`);
    const repayment = await postIdempotent(
      cashier,
      `/api/v1/loans/${loanId}/repayments`,
      {
        expectedVersion: active.body.version,
        amount: "100.00",
        businessDate: "2026-10-01",
        method: "CASH",
      },
      "repay-decide-race",
    );
    const requested = await post(cashier, "/api/v1/corrections", {
      originalLedgerEntryId: repayment.body.ledgerEntryId,
      reason: "Wrong amount",
      proposedValues: { amount: "120.00" },
    });
    const manager = await login("manager@example.com", "Manager12345");
    const decide = (decision: "approve" | "reject") =>
      post(manager, `/api/v1/corrections/${requested.body.id}/decision`, {
        expectedVersion: requested.body.version,
        decision,
        ...(decision === "reject" ? { reason: "Not justified" } : {}),
      });
    const [approve, reject] = await allowingSocketFlake(() =>
      Promise.all([decide("approve"), decide("reject")]),
    );
    expect([approve.status, reject.status].sort()).toEqual([201, 409]);
    const row = await prisma.correctionRequest.findUniqueOrThrow({
      where: { id: requested.body.id },
    });
    // Exactly one decision stuck, and only one version bump was spent.
    expect(row.version).toBe(requested.body.version + 1);

    // The real invariant, free of transport noise: a stale version can never
    // decide a correction that has already been decided.
    const stale = await decide("approve");
    expect(stale.status).toBe(409);
  });

  it("B05-11 sale proceeds may exceed the debt and settle the loan", async () => {
    const { loanId, assetId, cashier, staff, mgr, val } = await activeLoan();
    const active = await staff.get(`/api/v1/loans/${loanId}`);
    await post(mgr, `/api/v1/loans/${loanId}/default`, {
      expectedVersion: active.body.version,
      businessDate: "2026-09-20",
      reason: "Missed installments",
      policyBasis: "Office default policy clause 4",
    });
    const afterDefault = await staff.get(`/api/v1/loans/${loanId}`);
    await post(val, `/api/v1/assets/${assetId}/sale`, {
      expectedVersion: afterDefault.body.version,
      buyerName: "Second-hand dealer",
      buyerContact: "+64 21 555 0404",
      saleAmount: "900.00",
      saleDate: "2026-09-21",
      method: "Private sale",
    });
    const forReceipt = await cashier.get(`/api/v1/loans/${loanId}`);
    // Selling the security for more than the debt is normal; refusing the real
    // sale amount would leave the ledger unable to record what happened.
    const receipt = await postIdempotent(
      cashier,
      `/api/v1/loans/${loanId}/sale-receipts`,
      {
        expectedVersion: forReceipt.body.version,
        amount: "900.00",
        businessDate: "2026-09-21",
        method: "CASH",
      },
      "sale-receipt-surplus",
    );
    expect(receipt.status).toBe(201);
    expect(receipt.body.balanceAfter).toBe("0.00");
    expect(receipt.body.surplus).toBe("300.00");

    // Full recovery ends the default, which is what unblocks the return.
    const recovered = await cashier.get(`/api/v1/loans/${loanId}`);
    expect(recovered.body.status).toBe("SETTLED");
    expect(recovered.body.balance).toBe("0.00");
  });

  it("B05-06 settlement quote shows pending without production policy", async () => {
    const { loanId, assetId, cashier, staff } = await activeLoan();
    const manager = await login("manager@example.com", "Manager12345");
    const active = await staff.get(`/api/v1/loans/${loanId}`);
    await post(manager, `/api/v1/loans/${loanId}/default`, {
      expectedVersion: active.body.version,
      businessDate: "2026-09-20",
      reason: "Missed installments",
      policyBasis: "Office default policy clause 4",
    });
    const valOfficer = await login("val@example.com", "Valuation12");
    const loanAfterDefault = await staff.get(`/api/v1/loans/${loanId}`);
    await post(valOfficer, `/api/v1/assets/${assetId}/sale`, {
      expectedVersion: loanAfterDefault.body.version,
      buyerName: "Dealer",
      buyerContact: "+64 21 555 0404",
      saleAmount: "350.00",
      saleDate: "2026-09-21",
      method: "Private sale",
    });
    const forReceipt = await cashier.get(`/api/v1/loans/${loanId}`);
    await postIdempotent(
      cashier,
      `/api/v1/loans/${loanId}/sale-receipts`,
      {
        expectedVersion: forReceipt.body.version,
        amount: "350.00",
        businessDate: "2026-09-21",
        method: "CASH",
      },
      "sale-receipt-quote",
    );
    const quote = await staff.get(`/api/v1/loans/${loanId}/quotes?type=settlement`);
    expect(quote.status).toBe(200);
    expect(quote.body.ok).toBe(true);
    expect(quote.body.quote.pendingSettlement).toBe(true);
  });
});
