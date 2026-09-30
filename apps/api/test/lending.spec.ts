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
  seedCashier,
  seedLoanOfficer,
  seedManager,
  seedValuationOfficer,
  startApp,
} from "./helpers";
import { PrismaService } from "../src/prisma/prisma.service";
import { AuthService } from "../src/auth/auth.service";

/** Minimal PNG signature, enough for the server-side image sniffing check. */
const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("LENDING batch 03", () => {
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
    await seedAdmin(prisma, auth);
    const loanOfficer = await seedLoanOfficer(prisma, auth);
    const valuationOfficer = await seedValuationOfficer(prisma, auth);
    loanOfficerId = loanOfficer.id;
    valuationOfficerId = valuationOfficer.id;
  });

  async function loginLoanOfficer(): Promise<Agent> {
    const agent = await agentWithCsrf(app);
    const response = await post(agent, "/api/v1/auth/login", {
      email: "loan@example.com",
      password: "LoanOfficer12",
    });
    expect(response.status).toBe(201);
    return agent;
  }

  it("APP-01 draft survives refresh and submit requires readiness", async () => {
    const agent = await loginLoanOfficer();
    const borrower = await post(agent, "/api/v1/borrowers", {
      name: "Sam Borrower",
      phone: "+64 21 555 0101",
      address: "12 Queen Street, Auckland",
    });
    expect(borrower.status).toBe(201);
    const created = await post(agent, "/api/v1/applications", {
      borrowerId: borrower.body.id,
    });
    expect(created.status).toBe(201);
    const appId = created.body.id as string;

    const reloaded = await agent.get(`/api/v1/applications/${appId}`);
    expect(reloaded.status).toBe(200);
    expect(reloaded.body.borrowerId).toBe(borrower.body.id);

    const submitEarly = await post(agent, `/api/v1/applications/${appId}/submit`, {
      expectedVersion: reloaded.body.version,
    });
    expect(submitEarly.status).toBe(422);

    const patched = await patch(agent, `/api/v1/applications/${appId}`, {
      expectedVersion: reloaded.body.version,
      requestedAmount: "1200.00",
      purpose: "Vehicle repair",
      proposedTermMonths: 12,
      currentStep: "LOAN_DETAILS",
    });
    expect(patched.status).toBe(200);

    const asset = await post(agent, `/api/v1/applications/${appId}/assets`, {
      name: "Gold bracelet",
      description: "18k bracelet with clasp",
      condition: "Good",
    });
    expect(asset.status).toBe(201);
    const assetId = asset.body.assets[0].id as string;

    const stale = await patch(agent, `/api/v1/applications/${appId}`, {
      expectedVersion: reloaded.body.version,
      purpose: "Should conflict",
    });
    expect(stale.status).toBe(409);

    const terms = await agent
      .put(`/api/v1/applications/${appId}/terms`)
      .set("x-csrf-token", (await agent.get("/api/v1/auth/csrf")).body.token)
      .send({
        expectedVersion: asset.body.version,
        firstPaymentDate: "2026-10-01",
        frequency: "MONTHLY",
        periods: 12,
      });
    expect(terms.status).toBe(200);
    expect(terms.body.terms.policyConfigured).toBe(true);

    const readiness = await agent.get(`/api/v1/applications/${appId}/readiness`);
    expect(readiness.body.items.some((item: { id: string; complete: boolean }) => item.id === "security" && !item.complete)).toBe(true);

    const submitStillBlocked = await post(agent, `/api/v1/applications/${appId}/submit`, {
      expectedVersion: terms.body.version,
    });
    expect(submitStillBlocked.status).toBe(422);
  });

  it("LINK-01 account link is one-to-one and customer sees submitted applications", async () => {
    const staff = await loginLoanOfficer();
    const borrower = await post(staff, "/api/v1/borrowers", {
      name: "Casey Customer",
      phone: "+64 21 555 0202",
      address: "3 Lambie Drive, Auckland",
    });
    expect(borrower.status).toBe(201);

    const guest = await agentWithCsrf(app);
    const registered = await registerCustomer(guest, "casey@example.com");
    expect(registered.status).toBe(201);
    const verifyToken = auth.extractTokenFromMail(
      (await auth.latestMail("casey@example.com"))?.textBody,
    );
    await post(guest, "/api/v1/auth/email/verify", { token: verifyToken });

    const linked = await post(staff, `/api/v1/borrowers/${borrower.body.id}/account-link`, {
      userId: registered.body.user.id,
      verificationMethod: "Photo ID checked in branch",
      confirmIdentity: true,
    });
    expect(linked.status).toBe(201);

    const duplicate = await post(staff, `/api/v1/borrowers/${borrower.body.id}/account-link`, {
      userId: registered.body.user.id,
      verificationMethod: "Repeat attempt",
      confirmIdentity: true,
    });
    expect(duplicate.status).toBe(201);

    const application = await post(staff, "/api/v1/applications", {
      borrowerId: borrower.body.id,
    });
    const appId = application.body.id as string;
    await patch(staff, `/api/v1/applications/${appId}`, {
      expectedVersion: application.body.version,
      requestedAmount: "800.00",
      purpose: "School fees",
      proposedTermMonths: 6,
    });
    const withAsset = await post(staff, `/api/v1/applications/${appId}/assets`, {
      name: "Laptop",
      description: "MacBook Pro 2020",
      condition: "Fair",
    });
    const assetId = withAsset.body.assets[0].id as string;

    const photo = await staff
      .post(`/api/v1/applications/${appId}/assets/${assetId}/photos`)
      .set("x-csrf-token", (await staff.get("/api/v1/auth/csrf")).body.token)
      .attach("file", PNG_HEADER, {
        filename: "laptop.png",
        contentType: "image/png",
      });
    expect(photo.status).toBe(201);

    const afterPhoto = await staff.get(`/api/v1/applications/${appId}`);
    await staff
      .put(`/api/v1/applications/${appId}/terms`)
      .set("x-csrf-token", (await staff.get("/api/v1/auth/csrf")).body.token)
      .send({
        expectedVersion: afterPhoto.body.version,
        firstPaymentDate: "2026-11-01",
        frequency: "FORTNIGHTLY",
        periods: 12,
      });

    const valuations = await staff.get(`/api/v1/applications/${appId}/valuations`);
    const valuationId = valuations.body.items[0].id as string;
    const valAgent = await agentWithCsrf(app);
    await post(valAgent, "/api/v1/auth/login", {
      email: "val@example.com",
      password: "Valuation12",
    });
    await post(valAgent, `/api/v1/valuations/${valuationId}/complete`, {
      expectedVersion: 1,
      amount: "1000.00",
      valuationDate: "2026-09-17",
      basis: "Comparable sales",
      borrowerPresent: true,
      loanOfficerId,
      valuationOfficerId,
      participatedAt: "2026-09-17T10:00:00.000Z",
    });

    const latest = await staff.get(`/api/v1/applications/${appId}`);
    const submitted = await post(staff, `/api/v1/applications/${appId}/submit`, {
      expectedVersion: latest.body.version,
    });
    expect(submitted.status).toBe(201);
    expect(submitted.body.status).toBe("SUBMITTED");

    const customerLogin = await post(guest, "/api/v1/auth/login", {
      email: "casey@example.com",
      password: "customer-pass-12",
    });
    expect(customerLogin.status).toBe(201);

    const apps = await guest.get("/api/v1/me/applications");
    expect(apps.status).toBe(200);
    expect(apps.body.total).toBe(1);
    expect(apps.body.items[0].id).toBe(appId);
  });

  it("APP-02 rejects malformed dates instead of storing an invalid value", async () => {
    const agent = await loginLoanOfficer();
    const borrower = await post(agent, "/api/v1/borrowers", {
      name: "Dana Borrower",
      phone: "+64 21 555 0303",
      address: "9 Victoria Street, Auckland",
    });
    const created = await post(agent, "/api/v1/applications", {
      borrowerId: borrower.body.id,
    });
    const appId = created.body.id as string;
    const version = (await agent.get(`/api/v1/applications/${appId}`)).body.version as number;

    const badDate = await agent
      .put(`/api/v1/applications/${appId}/terms`)
      .set("x-csrf-token", (await agent.get("/api/v1/auth/csrf")).body.token)
      .send({
        expectedVersion: version,
        firstPaymentDate: "not-a-date",
        frequency: "MONTHLY",
        periods: 12,
      });
    expect(badDate.status).toBe(422);
    expect(badDate.body.fieldErrors.firstPaymentDate).toBeTruthy();

    const goodDate = await agent
      .put(`/api/v1/applications/${appId}/terms`)
      .set("x-csrf-token", (await agent.get("/api/v1/auth/csrf")).body.token)
      .send({
        expectedVersion: version,
        firstPaymentDate: "2026-10-01",
        frequency: "MONTHLY",
        periods: 12,
      });
    expect(goodDate.status).toBe(200);

    // The rejected attempt must not have consumed a version increment.
    const after = await agent.get(`/api/v1/applications/${appId}`);
    expect(after.body.version).toBe(goodDate.body.version);
  });

  it("customer self-apply is not available unless the feature flag is on", async () => {
    delete process.env.FEATURE_CUSTOMER_SELF_APPLY;
    const guest = await agentWithCsrf(app);
    const registered = await registerCustomer(guest, "self-apply-off@example.com");
    expect(registered.status).toBe(201);
    const verifyToken = auth.extractTokenFromMail(
      (await auth.latestMail("self-apply-off@example.com"))?.textBody,
    );
    await post(guest, "/api/v1/auth/email/verify", { token: verifyToken });
    await post(guest, "/api/v1/auth/login", {
      email: "self-apply-off@example.com",
      password: "customer-pass-12",
    });
    const created = await post(guest, "/api/v1/me/applications", {
      name: "Ava Customer",
      phone: "+64 21 555 0888",
      address: "10 High Street, Auckland",
      email: "self-apply-off@example.com",
    });
    expect(created.status).toBe(404);
  });

  describe("when customer self-apply is enabled", () => {
    beforeAll(() => {
      process.env.FEATURE_CUSTOMER_SELF_APPLY = "1";
    });
    afterAll(() => {
      delete process.env.FEATURE_CUSTOMER_SELF_APPLY;
    });

  it("APP-03 customer can apply with collateral so staff can review", async () => {
    const guest = await agentWithCsrf(app);
    const registered = await registerCustomer(guest, "self-apply@example.com");
    expect(registered.status).toBe(201);
    const verifyToken = auth.extractTokenFromMail(
      (await auth.latestMail("self-apply@example.com"))?.textBody,
    );
    await post(guest, "/api/v1/auth/email/verify", { token: verifyToken });
    await post(guest, "/api/v1/auth/login", {
      email: "self-apply@example.com",
      password: "customer-pass-12",
    });

    const created = await post(guest, "/api/v1/me/applications", {
      name: "Ava Customer",
      phone: "+64 21 555 0888",
      address: "10 High Street, Auckland",
      email: "self-apply@example.com",
    });
    expect(created.status).toBe(201);
    const appId = created.body.id as string;
    expect(created.body.status).toBe("DRAFT");
    expect(created.body.borrower.phone).toBe("+64 21 555 0888");

    const early = await post(guest, `/api/v1/me/applications/${appId}/submit`, {
      expectedVersion: created.body.version,
    });
    expect(early.status).toBe(422);

    const patched = await patch(guest, `/api/v1/me/applications/${appId}`, {
      expectedVersion: created.body.version,
      requestedAmount: "1500.00",
      purpose: "Vehicle repair",
      proposedTermMonths: 12,
    });
    expect(patched.status).toBe(200);

    const withAsset = await post(guest, `/api/v1/me/applications/${appId}/assets`, {
      name: "Gold chain",
      description: "22k chain, 18 grams",
      condition: "Good",
      category: "Gold",
    });
    expect(withAsset.status).toBe(201);
    const assetId = withAsset.body.assets[0].id as string;

    const photo = await guest
      .post(`/api/v1/applications/${appId}/assets/${assetId}/photos`)
      .set("x-csrf-token", (await guest.get("/api/v1/auth/csrf")).body.token)
      .attach("file", PNG_HEADER, {
        filename: "chain.png",
        contentType: "image/png",
      });
    expect(photo.status).toBe(201);

    const latest = await guest.get(`/api/v1/me/applications/${appId}`);
    const submitted = await post(guest, `/api/v1/me/applications/${appId}/submit`, {
      expectedVersion: latest.body.version,
    });
    expect(submitted.status).toBe(201);
    expect(submitted.body.status).toBe("SUBMITTED");

    const staff = await loginLoanOfficer();
    const listed = await staff.get("/api/v1/applications?status=SUBMITTED");
    expect(listed.body.items.some((item: { id: string }) => item.id === appId)).toBe(true);

    const staffView = await staff.get(`/api/v1/applications/${appId}`);
    const terms = await staff
      .put(`/api/v1/applications/${appId}/terms`)
      .set("x-csrf-token", (await staff.get("/api/v1/auth/csrf")).body.token)
      .send({
        expectedVersion: staffView.body.version,
        firstPaymentDate: "2026-11-01",
        frequency: "MONTHLY",
        periods: 12,
      });
    expect(terms.status).toBe(200);
    expect(terms.body.terms.policyConfigured).toBe(true);
  });
  });

  it("AUTHZ-01 a cashier cannot read the borrower book", async () => {
    await seedCashier(prisma, auth);
    const loanOfficer = await loginLoanOfficer();
    const created = await post(loanOfficer, "/api/v1/borrowers", {
      name: "Priya Borrower",
      phone: "+64 21 555 0404",
      address: "1 Queen Street, Auckland",
    });
    expect(created.status).toBe(201);

    const cashier = await agentWithCsrf(app);
    const login = await post(cashier, "/api/v1/auth/login", {
      email: "cashier@example.com",
      password: "Cashier12345",
    });
    expect(login.status).toBe(201);

    expect((await cashier.get("/api/v1/borrowers")).status).toBe(403);
    expect((await cashier.get(`/api/v1/borrowers/${created.body.id}`)).status).toBe(403);
    expect((await cashier.get("/api/v1/verified-accounts?q=priya")).status).toBe(403);

    // A loan officer still has access.
    expect((await loanOfficer.get("/api/v1/borrowers")).status).toBe(200);
  });

  it("freezes the loyalty tier from settled loans only", async () => {
    await seedManager(prisma, auth);
    const staff = await loginLoanOfficer();
    const valAgent = await agentWithCsrf(app);
    await post(valAgent, "/api/v1/auth/login", { email: "val@example.com", password: "Valuation12" });
    const manager = await agentWithCsrf(app);
    await post(manager, "/api/v1/auth/login", { email: "manager@example.com", password: "Manager12345" });

    async function csrfOf(agent: Agent) {
      return (await agent.get("/api/v1/auth/csrf")).body.token as string;
    }

    async function submitApplication(borrowerId: string) {
      const application = await post(staff, "/api/v1/applications", { borrowerId });
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
      const termsBody = {
        expectedVersion: latest.body.version,
        firstPaymentDate: "2026-10-01",
        frequency: "MONTHLY",
        periods: 6,
      };
      const terms = await staff
        .put(`/api/v1/applications/${appId}/terms`)
        .set("x-csrf-token", await csrfOf(staff))
        .send(termsBody);
      expect(terms.status).toBe(200);
      const valuations = await staff.get(`/api/v1/applications/${appId}/valuations`);
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
      return { appId, termsBody };
    }

    async function approve(appId: string, version: number) {
      const review = await manager.get(`/api/v1/applications/${appId}/review`);
      return post(manager, `/api/v1/applications/${appId}/decision`, {
        expectedVersion: version,
        decision: "approve",
        reviewed: true,
      });
    }

    const borrower = await post(staff, "/api/v1/borrowers", {
      name: "Loyal Alex",
      phone: "+64 21 555 0808",
      address: "1 Queen Street, Auckland",
    });
    expect(borrower.status).toBe(201);
    const borrowerId = borrower.body.id as string;

    const first = await submitApplication(borrowerId);
    const approved1 = await approve(first.appId, (await manager.get(`/api/v1/applications/${first.appId}/review`)).body.version);
    expect(approved1.status).toBe(201);
    const loan1 = await prisma.loan.findUniqueOrThrow({ where: { id: approved1.body.loanId } });
    expect(loan1.loyaltyTier).toBe("STANDARD");
    expect(loan1.discountBps).toBe(0);
    expect(loan1.annualRateBps).toBe(0);
    expect(await prisma.loan.count({ where: { borrowerId } })).toBe(1);
    expect(await prisma.loan.count({ where: { borrowerId, status: "SETTLED" } })).toBe(0);
    const borrowerView = await staff.get(`/api/v1/borrowers/${borrowerId}`);
    expect(borrowerView.body.loyalty).toEqual({ tier: "STANDARD", settledCount: 0, discountBps: 0 });

    await prisma.loan.update({ where: { id: loan1.id }, data: { status: "DEFAULTED" } });
    const second = await submitApplication(borrowerId);
    const approved2 = await approve(second.appId, (await manager.get(`/api/v1/applications/${second.appId}/review`)).body.version);
    expect(approved2.status).toBe(201);
    const loan2 = await prisma.loan.findUniqueOrThrow({ where: { id: approved2.body.loanId } });
    expect(loan2.loyaltyTier).toBe("STANDARD");
    expect(loan2.discountBps).toBe(0);

    await prisma.loan.update({ where: { id: loan1.id }, data: { status: "SETTLED" } });
    const third = await submitApplication(borrowerId);
    const preview = await staff
      .post(`/api/v1/applications/${third.appId}/schedule-preview`)
      .set("x-csrf-token", await csrfOf(staff))
      .send({ ...third.termsBody, discountBps: 999 });
    expect(preview.status).toBe(201);
    expect(preview.body.preview.loyaltyTier).toBe("RETURNING");
    expect(preview.body.preview.discountBps).toBe(200);
    expect(preview.body.preview.annualRateBps).toBe(0);
    expect(preview.body.preview.interestSaved).toBe("0.00");
    const approved3 = await approve(third.appId, (await manager.get(`/api/v1/applications/${third.appId}/review`)).body.version);
    expect(approved3.status).toBe(201);
    const loan3Id = approved3.body.loanId as string;
    const loan3 = await prisma.loan.findUniqueOrThrow({ where: { id: loan3Id } });
    expect(loan3.loyaltyTier).toBe("RETURNING");
    expect(loan3.discountBps).toBe(200);
    expect(loan3.annualRateBps).toBe(0);
    expect(await prisma.loan.count({ where: { borrowerId, status: "SETTLED" } })).toBe(1);

    const scheduleAmounts = await prisma.scheduleEntry.findMany({
      where: { loanId: loan3Id },
      orderBy: { number: "asc" },
      select: { amount: true },
    });
    const contractBefore = await prisma.loanContract.findFirstOrThrow({ where: { loanId: loan3Id } });
    const bodyHtmlBefore = contractBefore.bodyHtml;

    const previousTiers = process.env.LOYALTY_TIERS;
    process.env.LOYALTY_TIERS =
      '[{"tier":"RETURNING","minSettled":1,"discountBps":50},{"tier":"LOYAL","minSettled":3,"discountBps":999}]';
    try {
      const hash = await auth.hashPassword("Borrower12345");
      const customer = await prisma.user.create({
        data: {
          email: "loyal@example.com",
          emailNormalized: "loyal@example.com",
          name: "Loyal Alex",
          passwordHash: hash,
          role: "CUSTOMER",
          status: "ACTIVE",
          emailVerifiedAt: new Date(),
        },
      });
      await prisma.borrowerAccountLink.create({
        data: { borrowerId, userId: customer.id, status: "ACTIVE", verificationMethod: "test" },
      });
      const customerAgent = await agentWithCsrf(app);
      await post(customerAgent, "/api/v1/auth/login", { email: "loyal@example.com", password: "Borrower12345" });

      const frozenLoan = await prisma.loan.findUniqueOrThrow({ where: { id: loan3Id } });
      expect(frozenLoan.loyaltyTier).toBe("RETURNING");
      expect(frozenLoan.discountBps).toBe(200);
      expect(frozenLoan.annualRateBps).toBe(0);
      const staffLoan = await staff.get(`/api/v1/loans/${loan3Id}`);
      expect(staffLoan.body.loyaltyTier).toBe("RETURNING");
      expect(staffLoan.body.discountBps).toBe(200);
      expect(staffLoan.body.annualRateBps).toBe(0);
      expect(staffLoan.body.schedule.map((row: { amount: string }) => row.amount)).toEqual(
        scheduleAmounts.map((row) => row.amount),
      );
      const customerLoan = await customerAgent.get(`/api/v1/me/loans/${loan3Id}`);
      expect(customerLoan.body.loyaltyTier).toBe("RETURNING");
      expect(customerLoan.body.schedule.map((row: { amount: string }) => row.amount)).toEqual(
        scheduleAmounts.map((row) => row.amount),
      );
      const contractAfter = await prisma.loanContract.findFirstOrThrow({ where: { loanId: loan3Id } });
      expect(contractAfter.bodyHtml).toBe(bodyHtmlBefore);
      const borrowerAfter = await staff.get(`/api/v1/borrowers/${borrowerId}`);
      expect(borrowerAfter.body.loyalty.discountBps).toBe(50);
      expect(borrowerAfter.body.loyalty.settledCount).toBe(1);
    } finally {
      if (previousTiers === undefined) delete process.env.LOYALTY_TIERS;
      else process.env.LOYALTY_TIERS = previousTiers;
    }

    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { action: "application.approve", objectId: third.appId },
    });
    expect(audit.after).toMatchObject({
      loyaltyTier: "RETURNING",
      discountBps: 200,
      annualRateBps: 0,
    });
  });
});
