import { Inject, Injectable } from "@nestjs/common";
import { CompleteValuationInput, ValuationStatus } from "@toumua/contracts";
import { AuthUser } from "../auth/session";
import { conflict, notFound, validation } from "../common/http";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { assertManageLending, assertManageValuation } from "./access";

@Injectable()
export class ValuationsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async listForApplication(user: AuthUser, applicationId: string) {
    assertManageLending(user);
    const items = await this.prisma.valuation.findMany({
      where: { applicationId },
      include: {
        asset: { select: { id: true, name: true, description: true, condition: true } },
        loanOfficer: { select: { id: true, name: true } },
        valuationOfficer: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    return {
      items: items.map((row) => ({
        id: row.id,
        applicationId: row.applicationId,
        assetId: row.assetId,
        asset: row.asset,
        status: row.status,
        amount: row.amount,
        valuationDate: row.valuationDate?.toISOString() ?? null,
        basis: row.basis,
        borrowerPresent: row.borrowerPresent,
        loanOfficer: row.loanOfficer,
        valuationOfficer: row.valuationOfficer,
        participatedAt: row.participatedAt?.toISOString() ?? null,
        version: row.version,
      })),
    };
  }

  async request(user: AuthUser, applicationId: string, valuationOfficerId: string) {
    assertManageLending(user);
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: { assets: true },
    });
    if (!application) throw notFound("Application not found");
    if (application.assets.length === 0) {
      throw validation("Add security assets before requesting valuation");
    }
    const officer = await this.prisma.user.findUnique({ where: { id: valuationOfficerId } });
    if (!officer || officer.role !== "VALUATION_OFFICER") {
      throw validation("Select a valuation officer");
    }
    await Promise.all(
      application.assets.map((asset) =>
        this.prisma.valuation.upsert({
          where: { assetId: asset.id },
          create: {
            applicationId,
            assetId: asset.id,
            status: ValuationStatus.REQUESTED,
            valuationOfficerId,
          },
          update: {
            valuationOfficerId,
            status: ValuationStatus.REQUESTED,
          },
        }),
      ),
    );
    return this.listForApplication(user, applicationId);
  }

  async complete(user: AuthUser, valuationId: string, input: CompleteValuationInput) {
    assertManageValuation(user);
    const valuation = await this.prisma.valuation.findUnique({
      where: { id: valuationId },
      include: { application: true },
    });
    if (!valuation) throw notFound("Valuation not found");
    if (valuation.version !== input.expectedVersion) {
      throw conflict("This valuation was updated elsewhere. Reload and try again.");
    }
    if (!input.borrowerPresent) {
      throw validation("Borrower participation must be recorded to complete valuation", {
        borrowerPresent: ["Confirm borrower was present"],
      });
    }
    const loanOfficer = await this.prisma.user.findUnique({ where: { id: input.loanOfficerId } });
    const valuationOfficer = await this.prisma.user.findUnique({
      where: { id: input.valuationOfficerId },
    });
    if (!loanOfficer || loanOfficer.role !== "LOAN_OFFICER") {
      throw validation("Select a loan officer");
    }
    if (!valuationOfficer || valuationOfficer.role !== "VALUATION_OFFICER") {
      throw validation("Select a valuation officer");
    }
    const row = await this.prisma.valuation.update({
      where: { id: valuationId },
      data: {
        status: ValuationStatus.COMPLETED,
        amount: input.amount,
        valuationDate: new Date(input.valuationDate),
        basis: input.basis.trim(),
        borrowerPresent: input.borrowerPresent,
        loanOfficerId: input.loanOfficerId,
        valuationOfficerId: input.valuationOfficerId,
        participatedAt: new Date(input.participatedAt),
        version: { increment: 1 },
      },
    });
    await this.audit.write({
      actorId: user.id,
      action: "valuation.complete",
      objectType: "Valuation",
      objectId: row.id,
      after: { status: row.status, amount: row.amount },
    });
    return row;
  }
}
