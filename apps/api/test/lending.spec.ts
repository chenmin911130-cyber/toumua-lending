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
});
