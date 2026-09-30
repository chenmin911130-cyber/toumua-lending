import { writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { INestApplication } from "@nestjs/common";
import { escapeHtml, renderContract, sha256Text } from "../src/contracts/contract-template";
import { DocumentsService } from "../src/documents/documents.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { AuthService } from "../src/auth/auth.service";
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

const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const SIGNATURE = `data:image/png;base64,${PNG_HEADER.toString("base64")}`;

function dueLabel(date: Date) {
  return new Intl.DateTimeFormat("en-NZ", {
    timeZone: "Pacific/Auckland",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  })
    .format(date)
    .replace(/,/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

describe("digital contracts and documents", () => {
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

  async function createSubmittedApplication(staff: Agent) {
    const borrower = await post(staff, "/api/v1/borrowers", {
      name: "Alex Borrower",
      phone: "+64 21 555 0303",
      address: "1 Queen Street, Auckland",
    });
    expect(borrower.status).toBe(201);
    const application = await post(staff, "/api/v1/applications", { borrowerId: borrower.body.id });
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
        periods: 2,
      });
    const valuations = await staff.get(`/api/v1/applications/${appId}/valuations`);
    const valAgent = await login("val@example.com", "Valuation12");
    await post(valAgent, `/api/v1/valuations/${valuations.body.items[0].id}/complete`, {
      expectedVersion: 1,
      amount: "600.00",
      valuationDate: "2026-09-18",
      basis: "Comparable sales",
      borrowerPresent: true,
      loanOfficerId,
      valuationOfficerId,
      participatedAt: "2026-09-18T10:00:00.000Z",
    });
    const ready = await staff.get(`/api/v1/applications/${appId}`);
    const submitted = await post(staff, `/api/v1/applications/${appId}/submit`, {
      expectedVersion: ready.body.version,
    });
    expect(submitted.status).toBe(201);
    return { appId, assetId, borrowerId: borrower.body.id as string };
  }

  async function approveLoan() {
    const staff = await login("loan@example.com", "LoanOfficer12");
    const manager = await login("manager@example.com", "Manager12345");
    const created = await createSubmittedApplication(staff);
    const review = await manager.get(`/api/v1/applications/${created.appId}/review`);
    const approved = await post(manager, `/api/v1/applications/${created.appId}/decision`, {
      expectedVersion: review.body.version,
      decision: "approve",
      reviewed: true,
    });
    expect(approved.status).toBe(201);
    return { ...created, staff, manager, loanId: approved.body.loanId as string };
  }

  it("freezes the rendered terms when the contract is issued", async () => {
    const { loanId } = await approveLoan();
    const contract = await prisma.loanContract.findFirstOrThrow({ where: { loanId } });
    const schedule = await prisma.scheduleEntry.findMany({ where: { loanId }, orderBy: { number: "asc" } });
    expect(contract.status).toBe("ISSUED");
    expect(contract.bodyHtml).toContain("Alex Borrower");
    expect(contract.bodyHtml).toContain("600.00");
    for (const entry of schedule) {
      expect(contract.bodyHtml).toContain(dueLabel(entry.dueDate));
    }
    expect(contract.contentSha256).toHaveLength(64);
    expect(contract.bodyHtml).toContain("0.00%");
    expect(sha256Text(contract.bodyHtml)).toBe(contract.contentSha256);
    const loan = await prisma.loan.findUniqueOrThrow({ where: { id: loanId } });
    await prisma.borrower.update({ where: { id: loan.borrowerId }, data: { name: "Changed Name" } });
    await prisma.loan.update({ where: { id: loanId }, data: { principal: "1.00" } });
    const frozen = await prisma.loanContract.findFirstOrThrow({ where: { loanId } });
    expect(frozen.bodyHtml).toBe(contract.bodyHtml);
    expect(frozen.contentSha256).toBe(contract.contentSha256);
  });

  it("escapes borrower text before it is placed in the contract", () => {
    expect(escapeHtml("<script>")).toBe("&lt;script&gt;");
    const html = renderContract({
      number: "C-0001",
      issuedAt: new Date("2026-10-01T00:00:00.000Z"),
      borrowerName: "<script>",
      borrowerNumber: "BR-00001",
      borrowerAddress: "1 Queen Street",
      principal: "10.00",
      annualRateBps: 2100,
      frequency: "MONTHLY",
      periods: 1,
      schedule: [{ number: 1, dueDate: new Date("2026-11-01T00:00:00.000Z"), amount: "10.00" }],
      assets: [],
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("signs only the named borrower's current contract and stores both documents", async () => {
    const { loanId, borrowerId } = await approveLoan();
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
    const stranger = await prisma.user.create({
      data: {
        email: "other@example.com",
        emailNormalized: "other@example.com",
        name: "Other Person",
        passwordHash: hash,
        role: "CUSTOMER",
        status: "ACTIVE",
        emailVerifiedAt: new Date(),
      },
    });
    await prisma.borrowerAccountLink.create({
      data: { borrowerId, userId: customer.id, status: "ACTIVE", verificationMethod: "test" },
    });
    const contract = await prisma.loanContract.findFirstOrThrow({ where: { loanId } });
    const owner = await login("alex@example.com", "Borrower12345");
    const other = await login("other@example.com", "Borrower12345");
    const wrongName = await post(owner, `/api/v1/me/contracts/${contract.id}/sign`, {
      typedName: "Someone Else",
      signaturePng: SIGNATURE,
      consent: true,
      contentSha256: contract.contentSha256,
    });
    expect(wrongName.status).toBe(422);
    const stale = await post(owner, `/api/v1/me/contracts/${contract.id}/sign`, {
      typedName: "Alex Borrower",
      signaturePng: SIGNATURE,
      consent: true,
      contentSha256: "a".repeat(64),
    });
    expect(stale.status).toBe(409);
    const foreign = await post(other, `/api/v1/me/contracts/${contract.id}/sign`, {
      typedName: "Alex Borrower",
      signaturePng: SIGNATURE,
      consent: true,
      contentSha256: contract.contentSha256,
    });
    expect(foreign.status).toBe(404);
    const signed = await post(owner, `/api/v1/me/contracts/${contract.id}/sign`, {
      typedName: "Alex Borrower",
      signaturePng: SIGNATURE,
      consent: true,
      contentSha256: contract.contentSha256,
    });
    expect(signed.status).toBe(200);
    const docs = await prisma.document.findMany({ where: { loanId } });
    expect(docs.map((row) => row.kind).sort()).toEqual(["LOAN_CONTRACT_SIGNED", "SIGNATURE_IMAGE"]);
    const audit = await prisma.auditEvent.findFirst({
      where: { action: "contract.sign", objectId: contract.id },
    });
    expect(audit).toBeTruthy();
    const again = await post(owner, `/api/v1/me/contracts/${contract.id}/sign`, {
      typedName: "Alex Borrower",
      signaturePng: SIGNATURE,
      consent: true,
      contentSha256: contract.contentSha256,
    });
    expect(again.status).toBe(409);
  });

  it("refuses disbursement until the current contract is signed", async () => {
    const { loanId, assetId, staff } = await approveLoan();
    const before = await staff.get(`/api/v1/loans/${loanId}`);
    const valuer = await login("val@example.com", "Valuation12");
    await post(valuer, `/api/v1/assets/${assetId}/intake`, {
      expectedVersion: before.body.version,
      receivedOn: "2026-09-18",
      inspectedOn: "2026-09-18",
      inspectionResult: "PASS",
      location: "Vault A",
    });
    const cashier = await login("cashier@example.com", "Cashier12345");
    const unsigned = await cashier.get(`/api/v1/loans/${loanId}/disbursement-readiness`);
    const gate = unsigned.body.items.find((item: { id: string }) => item.id === "contract_signed");
    expect(gate.ok).toBe(false);
    const refused = await postIdempotent(
      cashier,
      `/api/v1/loans/${loanId}/disbursements`,
      { expectedVersion: unsigned.body.version ?? (await cashier.get(`/api/v1/loans/${loanId}`)).body.version, businessDate: "2026-09-18", method: "CASH" },
      "unsigned-disburse",
    );
    expect(refused.status).toBe(422);
    const contract = await prisma.loanContract.findFirstOrThrow({ where: { loanId, status: "ISSUED" } });
    const signed = await post(staff, `/api/v1/contracts/${contract.id}/sign-in-branch`, {
      typedName: "Alex Borrower",
      signaturePng: SIGNATURE,
      borrowerPresent: true,
      contentSha256: contract.contentSha256,
    });
    expect(signed.status).toBe(200);
    const current = await cashier.get(`/api/v1/loans/${loanId}`);
    const disbursed = await postIdempotent(
      cashier,
      `/api/v1/loans/${loanId}/disbursements`,
      { expectedVersion: current.body.version, businessDate: "2026-09-18", method: "CASH" },
      "signed-disburse",
    );
    expect(disbursed.status).toBe(201);
  });

  it("refuses to reissue a signed contract", async () => {
    const { loanId, staff, manager } = await approveLoan();
    const contract = await prisma.loanContract.findFirstOrThrow({ where: { loanId } });
    await post(staff, `/api/v1/contracts/${contract.id}/sign-in-branch`, {
      typedName: "Alex Borrower",
      signaturePng: SIGNATURE,
      borrowerPresent: true,
      contentSha256: contract.contentSha256,
    });
    const reissued = await post(manager, `/api/v1/loans/${loanId}/contract/reissue`, { reason: "Wrong terms" });
    expect(reissued.status).toBe(409);
  });

  it("rejects a tampered file and hides another borrower's document", async () => {
    const { loanId, borrowerId } = await approveLoan();
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
    const strangerUser = await prisma.user.create({
      data: {
        email: "other@example.com",
        emailNormalized: "other@example.com",
        name: "Other Person",
        passwordHash: hash,
        role: "CUSTOMER",
        status: "ACTIVE",
        emailVerifiedAt: new Date(),
      },
    });
    const otherBorrower = await prisma.borrower.create({
      data: { number: "BR-99999", name: "Other Person", phone: "0210000000", address: "2 Street" },
    });
    await prisma.borrowerAccountLink.create({
      data: { borrowerId, userId: customer.id, status: "ACTIVE", verificationMethod: "test" },
    });
    await prisma.borrowerAccountLink.create({
      data: { borrowerId: otherBorrower.id, userId: strangerUser.id, status: "ACTIVE", verificationMethod: "test" },
    });
    const contract = await prisma.loanContract.findFirstOrThrow({ where: { loanId } });
    const owner = await login("alex@example.com", "Borrower12345");
    const signed = await post(owner, `/api/v1/me/contracts/${contract.id}/sign`, {
      typedName: "Alex Borrower",
      signaturePng: SIGNATURE,
      consent: true,
      contentSha256: contract.contentSha256,
    });
    expect(signed.status).toBe(200);
    const copy = await prisma.document.findFirstOrThrow({ where: { loanId, kind: "LOAN_CONTRACT_SIGNED" } });
    const html = await owner.get(`/api/v1/documents/${copy.id}/file`);
    expect(html.status).toBe(200);
    expect(html.headers["content-security-policy"]).toBe(
      "sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'",
    );
    expect(html.headers["x-content-type-options"]).toBe("nosniff");
    const doc = await prisma.document.findFirstOrThrow({ where: { loanId, kind: "SIGNATURE_IMAGE" } });
    const stranger = await login("other@example.com", "Borrower12345");
    const hidden = await stranger.get(`/api/v1/documents/${doc.id}/file`);
    expect(hidden.status).toBe(404);
    writeFileSync(join(process.env.UPLOAD_DIR as string, "documents", doc.storageKey), Buffer.from("tampered"));
    const broken = await owner.get(`/api/v1/documents/${doc.id}/file`);
    expect(broken.status).toBe(409);
    const integrity = await prisma.auditEvent.findFirst({
      where: { action: "document.integrity_failed", objectId: doc.id },
    });
    expect(integrity).toBeTruthy();
  });

  it("lets exactly one of two simultaneous signatures succeed", async () => {
    const { loanId, staff } = await approveLoan();
    const contract = await prisma.loanContract.findFirstOrThrow({ where: { loanId } });
    const other = await login("loan@example.com", "LoanOfficer12");
    const body = {
      typedName: "Alex Borrower",
      signaturePng: SIGNATURE,
      borrowerPresent: true,
      contentSha256: contract.contentSha256,
    };
    const [first, second] = await Promise.all([
      post(staff, `/api/v1/contracts/${contract.id}/sign-in-branch`, body),
      post(other, `/api/v1/contracts/${contract.id}/sign-in-branch`, body),
    ]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 409]);
    const rows = await prisma.loanContract.findMany({ where: { loanId } });
    expect(rows.filter((row) => row.status === "SIGNED")).toHaveLength(1);
    const docs = await prisma.document.count({ where: { loanId } });
    expect(docs).toBe(2);
  });

  it("lets a manager issue version 1 for an approved loan that has no contract", async () => {
    const { loanId, assetId, staff, manager } = await approveLoan();
    await prisma.loanContract.deleteMany({ where: { loanId } });
    const blocked = await staff.get(`/api/v1/loans/${loanId}/disbursement-readiness`);
    const gate = blocked.body.items.find((item: { id: string }) => item.id === "contract_signed");
    expect(gate.ok).toBe(false);
    expect(gate.detail).toContain("issue the loan contract");
    const issued = await post(manager, `/api/v1/loans/${loanId}/contract/reissue`, {
      reason: "Loan approved before contracts existed",
    });
    expect(issued.status).toBe(200);
    expect(issued.body.version).toBe(1);
    expect(issued.body.status).toBe("ISSUED");
    const audit = await prisma.auditEvent.findFirst({
      where: { action: "contract.issue", objectId: issued.body.id },
    });
    expect(audit?.reason).toBe("Loan approved before contracts existed");
    const before = await staff.get(`/api/v1/loans/${loanId}`);
    const valuer = await login("val@example.com", "Valuation12");
    await post(valuer, `/api/v1/assets/${assetId}/intake`, {
      expectedVersion: before.body.version,
      receivedOn: "2026-09-18",
      inspectedOn: "2026-09-18",
      inspectionResult: "PASS",
      location: "Vault A",
    });
    const contract = await prisma.loanContract.findFirstOrThrow({ where: { loanId } });
    const signed = await post(staff, `/api/v1/contracts/${contract.id}/sign-in-branch`, {
      typedName: "Alex Borrower",
      signaturePng: SIGNATURE,
      borrowerPresent: true,
      contentSha256: contract.contentSha256,
    });
    expect(signed.status).toBe(200);
    const cashier = await login("cashier@example.com", "Cashier12345");
    const current = await cashier.get(`/api/v1/loans/${loanId}`);
    const disbursed = await postIdempotent(
      cashier,
      `/api/v1/loans/${loanId}/disbursements`,
      { expectedVersion: current.body.version, businessDate: "2026-09-18", method: "CASH" },
      "legacy-disburse",
    );
    expect(disbursed.status).toBe(201);
  });

  it("lets exactly one of two simultaneous first issues create version 1", async () => {
    const { loanId, manager } = await approveLoan();
    await prisma.loanContract.deleteMany({ where: { loanId } });
    const other = await login("manager@example.com", "Manager12345");
    const body = { reason: "Loan approved before contracts existed" };
    const [first, second] = await Promise.all([
      post(manager, `/api/v1/loans/${loanId}/contract/reissue`, body),
      post(other, `/api/v1/loans/${loanId}/contract/reissue`, body),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);
    const rows = await prisma.loanContract.findMany({ where: { loanId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.version).toBe(1);
    expect(rows[0]?.status).toBe("ISSUED");
  });

  it("signs the name frozen at issue after the borrower is renamed", async () => {
    const { loanId, borrowerId, staff } = await approveLoan();
    const contract = await prisma.loanContract.findFirstOrThrow({ where: { loanId } });
    await prisma.borrower.update({ where: { id: borrowerId }, data: { name: "Renamed Person" } });
    const renamed = await post(staff, `/api/v1/contracts/${contract.id}/sign-in-branch`, {
      typedName: "Renamed Person",
      signaturePng: SIGNATURE,
      borrowerPresent: true,
      contentSha256: contract.contentSha256,
    });
    expect(renamed.status).toBe(422);
    const original = await post(staff, `/api/v1/contracts/${contract.id}/sign-in-branch`, {
      typedName: "Alex Borrower",
      signaturePng: SIGNATURE,
      borrowerPresent: true,
      contentSha256: contract.contentSha256,
    });
    expect(original.status).toBe(200);
  });

  it("refuses in-branch signing by a cashier or valuation officer", async () => {
    const { loanId } = await approveLoan();
    const contract = await prisma.loanContract.findFirstOrThrow({ where: { loanId } });
    const body = {
      typedName: "Alex Borrower",
      signaturePng: SIGNATURE,
      borrowerPresent: true,
      contentSha256: contract.contentSha256,
    };
    const cashier = await login("cashier@example.com", "Cashier12345");
    const valuer = await login("val@example.com", "Valuation12");
    expect((await post(cashier, `/api/v1/contracts/${contract.id}/sign-in-branch`, body)).status).toBe(403);
    expect((await post(valuer, `/api/v1/contracts/${contract.id}/sign-in-branch`, body)).status).toBe(403);
  });

  it("refuses to sign a void contract", async () => {
    const { loanId, manager, staff } = await approveLoan();
    const first = await prisma.loanContract.findFirstOrThrow({ where: { loanId } });
    const reissued = await post(manager, `/api/v1/loans/${loanId}/contract/reissue`, {
      reason: "Reprint before signing",
      contractId: first.id,
    });
    expect(reissued.status).toBe(200);
    const signed = await post(staff, `/api/v1/contracts/${first.id}/sign-in-branch`, {
      typedName: "Alex Borrower",
      signaturePng: SIGNATURE,
      borrowerPresent: true,
      contentSha256: first.contentSha256,
    });
    expect(signed.status).toBe(409);
  });

  it("refuses to delete a document that a contract still references", async () => {
    const { loanId, staff, manager } = await approveLoan();
    const contract = await prisma.loanContract.findFirstOrThrow({ where: { loanId } });
    const signed = await post(staff, `/api/v1/contracts/${contract.id}/sign-in-branch`, {
      typedName: "Alex Borrower",
      signaturePng: SIGNATURE,
      borrowerPresent: true,
      contentSha256: contract.contentSha256,
    });
    expect(signed.status).toBe(200);
    const saved = await prisma.loanContract.findUniqueOrThrow({ where: { id: contract.id } });
    const signature = await manager.delete(`/api/v1/documents/${saved.signatureDocId}`).set("x-csrf-token", await csrfOf(manager));
    const copy = await manager.delete(`/api/v1/documents/${saved.signedDocId}`).set("x-csrf-token", await csrfOf(manager));
    expect(signature.status).toBe(409);
    expect(copy.status).toBe(409);
    expect(await prisma.document.count({ where: { id: { in: [saved.signatureDocId!, saved.signedDocId!] }, deletedAt: null } })).toBe(2);
  });

  it("returns 404 for an unknown borrower and removes a file when the database write fails", async () => {
    const manager = await login("manager@example.com", "Manager12345");
    const missing = await manager
      .post("/api/v1/borrowers/missing-borrower/documents")
      .set("x-csrf-token", await csrfOf(manager))
      .attach("file", PNG_HEADER, { filename: "id.png", contentType: "image/png" });
    expect(missing.status).toBe(404);

    const dir = join(process.env.UPLOAD_DIR ?? join(process.cwd(), "../../storage/uploads"), "documents");
    const before = new Set(existsSync(dir) ? readdirSync(dir) : []);
    const docs = app.get(DocumentsService);
    await expect(
      docs.store({
        kind: "OTHER",
        buffer: PNG_HEADER,
        filename: "orphan.png",
        mimeType: "image/png",
        loanId: "missing-loan",
      }),
    ).rejects.toThrow();
    const added = (existsSync(dir) ? readdirSync(dir) : []).filter((name) => !before.has(name));
    expect(added).toEqual([]);
  });
});
