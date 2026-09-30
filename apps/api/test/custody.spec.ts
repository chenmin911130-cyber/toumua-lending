import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { INestApplication } from "@nestjs/common";
import {
  Agent,
  agentWithCsrf,
  patch,
  post,
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

describe("storage locations, custody history, and borrower on assets", () => {
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

  async function createLocation(
    agent: Agent,
    input: { code: string; name: string; kind: string; capacity?: number | null; active?: boolean },
  ) {
    const response = await post(agent, "/api/v1/storage-locations", {
      secure: true,
      ...input,
    });
    expect(response.status).toBe(201);
    return response.body as { id: string; code: string; occupied: number };
  }

  async function valuedLoan(name = "Alex Borrower") {
    const staff = await login("loan@example.com", "LoanOfficer12");
    const borrower = await post(staff, "/api/v1/borrowers", {
      name,
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
    const valuer = await login("val@example.com", "Valuation12");
    const completed = await post(valuer, `/api/v1/valuations/${valuations.body.items[0].id}/complete`, {
      expectedVersion: 1,
      amount: "800.00",
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
    const manager = await login("manager@example.com", "Manager12345");
    const review = await manager.get(`/api/v1/applications/${appId}/review`);
    const approved = await post(manager, `/api/v1/applications/${appId}/decision`, {
      expectedVersion: review.body.version,
      decision: "approve",
      reviewed: true,
    });
    expect(approved.status).toBe(201);
    const loanId = approved.body.loanId as string;
    const loan = await staff.get(`/api/v1/loans/${loanId}`);
    return {
      staff,
      valuer,
      assetId,
      loanId,
      version: loan.body.version as number,
      borrowerName: borrower.body.name as string,
      borrowerNumber: borrower.body.number as string,
    };
  }

  it("stores an asset at a chosen location and increases occupied", async () => {
    const manager = await login("manager@example.com", "Manager12345");
    const safe = await createLocation(manager, {
      code: "SAFE-A-01",
      name: "Main safe",
      kind: "SAFE",
      capacity: 10,
    });
    expect(safe.occupied).toBe(0);
    const loan = await valuedLoan("Hina Borrower");
    const intake = await post(loan.valuer, `/api/v1/assets/${loan.assetId}/intake`, {
      expectedVersion: loan.version,
      receivedOn: "2026-09-18",
      inspectedOn: "2026-09-18",
      inspectionResult: "PASS",
      storageLocationId: safe.id,
    });
    expect(intake.status).toBe(201);
    expect(intake.body.storageLocation.code).toBe("SAFE-A-01");
    expect(intake.body.storageLocationLabel).toBe("SAFE-A-01");
    expect(intake.body.borrower).toMatchObject({
      name: loan.borrowerName,
      number: loan.borrowerNumber,
    });
    const locations = await manager.get("/api/v1/storage-locations?active=true");
    const stored = locations.body.items.find((item: { code: string }) => item.code === "SAFE-A-01");
    expect(stored.occupied).toBe(1);
    const byName = await loan.staff.get(`/api/v1/assets?q=${encodeURIComponent(loan.borrowerName)}`);
    expect(byName.body.items.some((item: { id: string }) => item.id === loan.assetId)).toBe(true);
    const byNumber = await loan.staff.get(`/api/v1/assets?q=${encodeURIComponent(loan.borrowerNumber)}`);
    expect(byNumber.body.items.some((item: { id: string }) => item.id === loan.assetId)).toBe(true);
  });

  it("shows the latest stored or relocated place after a move and audits asset.relocate", async () => {
    const manager = await login("manager@example.com", "Manager12345");
    const safe = await createLocation(manager, {
      code: "SAFE-A-01",
      name: "Main safe",
      kind: "SAFE",
      capacity: 10,
    });
    const cabinet = await createLocation(manager, {
      code: "CAB-B-01",
      name: "Locked cabinet B",
      kind: "LOCKED_CABINET",
      capacity: 8,
    });
    const loan = await valuedLoan();
    const intake = await post(loan.valuer, `/api/v1/assets/${loan.assetId}/intake`, {
      expectedVersion: loan.version,
      receivedOn: "2026-09-18",
      inspectedOn: "2026-09-18",
      inspectionResult: "PASS",
      storageLocationId: safe.id,
    });
    expect(intake.status).toBe(201);
    const moved = await patch(loan.valuer, `/api/v1/assets/${loan.assetId}/custody`, {
      expectedVersion: intake.body.version,
      storageLocationId: cabinet.id,
      reason: "shelf repair",
    });
    expect(moved.status).toBe(200);
    expect(moved.body.storageLocation.code).toBe("CAB-B-01");
    expect(moved.body.storageLocationLabel).toBe("CAB-B-01");
    const audit = await prisma.auditEvent.findFirst({
      where: { action: "asset.relocate", objectId: loan.assetId },
    });
    expect(audit?.before).toEqual({ location: "SAFE-A-01" });
    expect(audit?.after).toEqual({ location: "CAB-B-01" });
    const history = await loan.staff.get(`/api/v1/assets/${loan.assetId}/history`);
    expect(history.status).toBe(200);
    const relocation = history.body.find(
      (entry: { action: string; kind: string }) => entry.kind === "custody" && entry.action === "RELOCATED",
    );
    expect(relocation.summary).toBe("Moved from SAFE-A-01 to CAB-B-01 — reason: shelf repair");
    expect(history.body[0].at >= relocation.at).toBe(true);
    const locations = await manager.get("/api/v1/storage-locations");
    const safeRow = locations.body.items.find((item: { code: string }) => item.code === "SAFE-A-01");
    const cabinetRow = locations.body.items.find((item: { code: string }) => item.code === "CAB-B-01");
    expect(safeRow.occupied).toBe(0);
    expect(cabinetRow.occupied).toBe(1);
  });

  it("rejects intake into a full location and into an inactive location", async () => {
    const manager = await login("manager@example.com", "Manager12345");
    const safe = await createLocation(manager, {
      code: "SAFE-A-01",
      name: "Main safe",
      kind: "SAFE",
      capacity: 1,
    });
    const closed = await createLocation(manager, {
      code: "OFF-01",
      name: "Off-site storage (partner)",
      kind: "OFFSITE",
    });
    const deactivated = await patch(manager, `/api/v1/storage-locations/${closed.id}`, { active: false });
    expect(deactivated.status).toBe(200);
    const first = await valuedLoan("First Borrower");
    const stored = await post(first.valuer, `/api/v1/assets/${first.assetId}/intake`, {
      expectedVersion: first.version,
      receivedOn: "2026-09-18",
      inspectedOn: "2026-09-18",
      inspectionResult: "PASS",
      storageLocationId: safe.id,
    });
    expect(stored.status).toBe(201);
    const second = await valuedLoan("Second Borrower");
    const full = await post(second.valuer, `/api/v1/assets/${second.assetId}/intake`, {
      expectedVersion: second.version,
      receivedOn: "2026-09-18",
      inspectedOn: "2026-09-18",
      inspectionResult: "PASS",
      storageLocationId: safe.id,
    });
    expect(full.status).toBe(409);
    expect(full.body.message).toBe("This location is full");
    const inactive = await post(second.valuer, `/api/v1/assets/${second.assetId}/intake`, {
      expectedVersion: second.version,
      receivedOn: "2026-09-18",
      inspectedOn: "2026-09-18",
      inspectionResult: "PASS",
      storageLocationId: closed.id,
    });
    expect(inactive.status).toBe(422);
  });

  it("refuses to deactivate a location that still holds stored assets", async () => {
    const manager = await login("manager@example.com", "Manager12345");
    const safe = await createLocation(manager, {
      code: "SAFE-A-01",
      name: "Main safe",
      kind: "SAFE",
      capacity: 10,
    });
    const loan = await valuedLoan();
    const intake = await post(loan.valuer, `/api/v1/assets/${loan.assetId}/intake`, {
      expectedVersion: loan.version,
      receivedOn: "2026-09-18",
      inspectedOn: "2026-09-18",
      inspectionResult: "PASS",
      storageLocationId: safe.id,
    });
    expect(intake.status).toBe(201);
    const blocked = await patch(manager, `/api/v1/storage-locations/${safe.id}`, { active: false });
    expect(blocked.status).toBe(409);
    expect(blocked.body.message).toBe("Move the stored assets out before deactivating this location");
  });

  it("records only changed asset fields in history", async () => {
    const staff = await login("loan@example.com", "LoanOfficer12");
    const borrower = await post(staff, "/api/v1/borrowers", {
      name: "Alex Borrower",
      phone: "+64 21 555 0404",
      address: "1 Queen Street, Auckland",
    });
    expect(borrower.status).toBe(201);
    const application = await post(staff, "/api/v1/applications", { borrowerId: borrower.body.id });
    expect(application.status).toBe(201);
    const appId = application.body.id as string;
    const created = await post(staff, `/api/v1/applications/${appId}/assets`, {
      name: "Watch",
      description: "Steel wristwatch",
      condition: "Good",
      category: "Jewellery",
      identifier: "W-1",
    });
    expect(created.status).toBe(201);
    const assetId = created.body.assets[0].id as string;
    const updated = await patch(staff, `/api/v1/applications/${appId}/assets/${assetId}`, {
      name: "Watch",
      description: "Steel wristwatch",
      condition: "Fair",
      category: "Jewellery",
      identifier: "W-1",
    });
    expect(updated.status).toBe(200);
    const history = await staff.get(`/api/v1/assets/${assetId}/history`);
    expect(history.status).toBe(200);
    const change = history.body.find((entry: { action: string }) => entry.action === "asset.update");
    expect(change.kind).toBe("audit");
    expect(change.before).toEqual({ condition: "Good" });
    expect(change.after).toEqual({ condition: "Fair" });
    const updateAt = history.body.findIndex((entry: { action: string }) => entry.action === "asset.update");
    const createAt = history.body.findIndex((entry: { action: string }) => entry.action === "asset.create");
    expect(updateAt).toBeGreaterThanOrEqual(0);
    expect(updateAt).toBeLessThan(createAt);
  });

  it("forbids a cashier from creating a storage location", async () => {
    const cashier = await login("cashier@example.com", "Cashier12345");
    const response = await post(cashier, "/api/v1/storage-locations", {
      code: "SAFE-A-01",
      name: "Main safe",
      kind: "SAFE",
    });
    expect(response.status).toBe(403);
  });
});
