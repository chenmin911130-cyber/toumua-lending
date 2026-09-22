import { NestFactory } from "@nestjs/core";
import { BusinessRole } from "@toumua/contracts";
import { AppModule } from "../src/app.module";
import { toPublicUser, type AuthUser } from "../src/auth/session";
import { PrismaService } from "../src/prisma/prisma.service";
import { ApplicationsService } from "../src/lending/applications.service";
import { CorrectionsService } from "../src/lending/corrections.service";
import { CustodyService } from "../src/lending/custody.service";
import { DecisionsService } from "../src/lending/decisions.service";
import { LoansService } from "../src/lending/loans.service";
import { MoneyService } from "../src/lending/money.service";
import { UploadsService } from "../src/lending/uploads.service";
import { ValuationsService } from "../src/lending/valuations.service";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function day(offset: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function actor(user: { id: string; name: string; email: string; role: string | null; status: string; emailVerifiedAt: Date | null; permissions?: { permission: string }[] }): AuthUser {
  return { ...toPublicUser(user as never, false), sessionId: "demo-seed" };
}

async function main() {
  process.env.CALCULATION_POLICY = process.env.CALCULATION_POLICY ?? "demo";
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn"] });
  const prisma = app.get(PrismaService);
  const existing = await prisma.application.count({ where: { number: { startsWith: "DEMO-" } } });
  if (existing > 0) {
    console.log("Demo data already present");
    await app.close();
    return;
  }

  const applications = app.get(ApplicationsService);
  const decisions = app.get(DecisionsService);
  const valuations = app.get(ValuationsService);
  const uploads = app.get(UploadsService);
  const custody = app.get(CustodyService);
  const money = app.get(MoneyService);
  const loans = app.get(LoansService);
  const corrections = app.get(CorrectionsService);

  const users = await prisma.user.findMany({ include: { permissions: true } });
  const byEmail = new Map(users.map((user) => [user.email, user]));
  const staff = actor(byEmail.get("staff@toumua.nz")!);
  const manager = actor(byEmail.get("manager@toumua.nz")!);
  const valuer = actor(byEmail.get("valuation@toumua.nz")!);
  const cashier = actor(byEmail.get("cashier@toumua.nz")!);
  if (staff.role !== BusinessRole.LOAN_OFFICER) throw new Error("Missing staff demo account");

  let sequence = 1;
  async function mark(id: string) {
    const number = `DEMO-${String(sequence).padStart(4, "0")}`;
    sequence += 1;
    await prisma.application.update({ where: { id }, data: { number } });
    return number;
  }

  async function openFile(email: string, amount: string, purpose: string) {
    const borrower = await prisma.borrower.findFirst({ where: { email } });
    if (!borrower) throw new Error(`No borrower for ${email}`);
    const created = await applications.create(staff, borrower.id);
    await mark(created.id);
    const patched = await applications.patch(staff, created.id, {
      expectedVersion: created.version,
      requestedAmount: amount,
      purpose,
      proposedTermMonths: 8,
    });
    const withAsset = await applications.addAsset(staff, created.id, {
      name: "Security item",
      description: purpose,
      condition: "Good",
      category: "General",
      identifier: "",
    });
    const assetId = withAsset.assets[0]?.id;
    if (!assetId) throw new Error("Asset was not created");
    await uploads.addPhoto(staff, created.id, assetId, {
      originalname: "security.png",
      mimetype: "image/png",
      size: PNG.length,
      buffer: PNG,
    });
    return { id: created.id, version: patched.version, assetId };
  }

  async function valueAndSubmit(id: string, amount: string, firstPaymentOffset = -7) {
    await valuations.request(staff, id, valuer.id);
    const pending = await prisma.valuation.findFirst({ where: { applicationId: id } });
    if (!pending) throw new Error("Valuation was not requested");
    await valuations.complete(valuer, pending.id, {
      expectedVersion: pending.version,
      amount,
      valuationDate: day(-2),
      basis: "Office inspection",
      borrowerPresent: true,
      loanOfficerId: staff.id,
      valuationOfficerId: valuer.id,
      participatedAt: new Date().toISOString(),
    });
    const current = await prisma.application.findUniqueOrThrow({ where: { id } });
    await applications.saveTerms(staff, id, {
      expectedVersion: current.version,
      firstPaymentDate: day(firstPaymentOffset),
      frequency: "WEEKLY",
      periods: 4,
    });
    const ready = await prisma.application.findUniqueOrThrow({ where: { id } });
    return applications.submit(staff, id, ready.version);
  }

  async function approve(id: string) {
    const review = await decisions.review(manager, id);
    return decisions.decide(manager, id, {
      expectedVersion: review.version,
      decision: "approve",
      reviewed: true,
    });
  }

  async function storeAndDisburse(loanId: string, assetId: string) {
    const loan = await prisma.loan.findUniqueOrThrow({ where: { id: loanId } });
    await custody.intake(valuer, assetId, {
      expectedVersion: loan.version,
      receivedOn: day(-1),
      inspectedOn: day(-1),
      inspectionResult: "PASS",
      location: "Vault A",
    });
    const current = await prisma.loan.findUniqueOrThrow({ where: { id: loanId } });
    return money.disburse(
      cashier,
      loanId,
      { expectedVersion: current.version, businessDate: day(-1), method: "CASH" },
      `demo-disburse-${loanId}`,
    );
  }

  const sarah = await openFile("sarah.tama@toumua.nz", "2400.00", "Home repairs");
  await valueAndSubmit(sarah.id, "4000.00");
  const sarahDecision = await approve(sarah.id);
  const sarahLoanId = (sarahDecision as { loanId?: string }).loanId;
  if (!sarahLoanId) throw new Error("Sarah loan was not created");
  await storeAndDisburse(sarahLoanId, sarah.assetId);
  const sarahLoan = await loans.get(cashier, sarahLoanId);
  const first = sarahLoan.schedule?.[0];
  const second = sarahLoan.schedule?.[1];
  if (first && second) {
    let version = (await prisma.loan.findUniqueOrThrow({ where: { id: sarahLoanId } })).version;
    await money.repay(cashier, sarahLoanId, {
      expectedVersion: version,
      amount: first.amount,
      businessDate: day(-6),
      method: "CASH",
    }, `demo-repay-${sarahLoanId}-1`);
    version = (await prisma.loan.findUniqueOrThrow({ where: { id: sarahLoanId } })).version;
    const posted = await money.repay(cashier, sarahLoanId, {
      expectedVersion: version,
      amount: second.amount,
      businessDate: day(-1),
      method: "CASH",
    }, `demo-repay-${sarahLoanId}-2`);
    const entry = await prisma.ledgerEntry.findFirst({
      where: { loanId: sarahLoanId, type: "REPAYMENT" },
      orderBy: { createdAt: "desc" },
    });
    if (entry) {
      await corrections.create(cashier, {
        originalLedgerEntryId: entry.id,
        reason: "Recorded as cash; customer paid by card",
        proposedValues: { method: "CARD", externalReference: "DEMO-CARD" },
      });
      const request = await prisma.correctionRequest.findFirst({
        where: { originalLedgerEntryId: entry.id },
        orderBy: { createdAt: "desc" },
      });
      if (request) {
        await corrections.decide(manager, request.id, {
          expectedVersion: request.version,
          decision: "approve",
          reason: "Method only",
        });
      }
    }
    void posted;
  }

  const james = await openFile("james.latu@toumua.nz", "1800.00", "Vehicle");
  await valueAndSubmit(james.id, "3200.00");

  const mere = await openFile("mere.kaho@toumua.nz", "900.00", "Family");
  await valuations.request(staff, mere.id, valuer.id);

  await openFile("ana.folau@toumua.nz", "800.00", "Personal");

  const david = await openFile("david.chen@toumua.nz", "1500.00", "Vehicle");
  await valueAndSubmit(david.id, "2600.00", -7);
  const davidDecision = await approve(david.id);
  if (davidDecision.loanId) await storeAndDisburse(davidDecision.loanId, david.assetId);

  const sione = await openFile("sione.tapu@toumua.nz", "1600.00", "Family");
  await valueAndSubmit(sione.id, "2800.00", -21);
  const sioneDecision = await approve(sione.id);
  if (sioneDecision.loanId) await storeAndDisburse(sioneDecision.loanId, sione.assetId);

  const lisa = await openFile("lisa.wong@toumua.nz", "1200.00", "Personal");
  await valueAndSubmit(lisa.id, "2000.00", -40);
  const lisaDecision = await approve(lisa.id);
  if (lisaDecision.loanId) {
    await storeAndDisburse(lisaDecision.loanId, lisa.assetId);
    const detail = await loans.get(cashier, lisaDecision.loanId);
    for (const [index, entry] of detail.schedule.entries()) {
      const current = await prisma.loan.findUniqueOrThrow({ where: { id: lisaDecision.loanId } });
      if (current.status === "SETTLED") break;
      await money.repay(cashier, lisaDecision.loanId, {
        expectedVersion: current.version,
        amount: entry.amount,
        businessDate: day(-30 + index),
        method: "CASH",
      }, `demo-repay-${lisaDecision.loanId}-${index}`);
    }
  }

  const toma = await openFile("toma.vaka@toumua.nz", "2200.00", "Business");
  await valueAndSubmit(toma.id, "3600.00", -14);
  const tomaDecision = await approve(toma.id);
  if (tomaDecision.loanId) {
    await storeAndDisburse(tomaDecision.loanId, toma.assetId);
    const current = await prisma.loan.findUniqueOrThrow({ where: { id: tomaDecision.loanId } });
    await loans.declareDefault(manager, tomaDecision.loanId, {
      expectedVersion: current.version,
      businessDate: day(-1),
      reason: "Missed repayments",
      policyBasis: "Demo default for the classroom walkthrough",
    });
  }

  const rachel = await openFile("rachel.ngata@toumua.nz", "3000.00", "Home repair");
  await valueAndSubmit(rachel.id, "3100.00");
  const rachelReview = await decisions.review(manager, rachel.id);
  await decisions.decide(manager, rachel.id, {
    expectedVersion: rachelReview.version,
    decision: "decline",
    reason: "Security value is not significantly greater than the loan",
  });

  const peter = await openFile("peter.ioane@toumua.nz", "1100.00", "Personal");
  await valueAndSubmit(peter.id, "2500.00");
  await approve(peter.id);

  console.log("Demo applications seeded");
  await app.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
