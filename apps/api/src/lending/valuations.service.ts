import { Inject, Injectable } from "@nestjs/common";
import {
  ApplicationStatus,
  AssetStatus,
  BusinessRole,
  CompleteValuationInput,
  ValuationStatus,
} from "@toumua/contracts";
import { AuthUser } from "../auth/session";
import { conflict, notFound, validation } from "../common/http";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  assertCompleteApplicationValuation,
  assertManageLending,
  assertManageValuation,
  assertViewApplicationValuations,
} from "./access";

@Injectable()
export class ValuationsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async listQueue(user: AuthUser) {
    assertManageValuation(user);
    const openApplications = await this.prisma.application.findMany({
      where: { status: { in: [ApplicationStatus.DRAFT, ApplicationStatus.SUBMITTED] } },
      select: { id: true, assets: { select: { id: true } } },
    });
    await Promise.all(
      openApplications.flatMap((application) =>
        application.assets.map((asset) =>
          this.prisma.valuation.upsert({
            where: { assetId: asset.id },
            create: {
              applicationId: application.id,
              assetId: asset.id,
              status: ValuationStatus.REQUESTED,
            },
            update: {},
          }),
        ),
      ),
    );
    const items = await this.prisma.valuation.findMany({
      where: {
        status: { in: [ValuationStatus.REQUESTED, ValuationStatus.IN_PROGRESS] },
        application: { status: { in: [ApplicationStatus.DRAFT, ApplicationStatus.SUBMITTED] } },
      },
      include: {
        application: {
          select: {
            id: true,
            number: true,
            status: true,
            borrower: { select: { name: true } },
          },
        },
        asset: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
    return {
      items: items.map((row) => ({
        id: row.id,
        applicationId: row.applicationId,
        applicationNumber: row.application.number,
        applicationStatus: row.application.status,
        borrowerName: row.application.borrower?.name ?? null,
        assetId: row.assetId,
        assetName: row.asset.name,
        status: row.status,
        version: row.version,
        updatedAt: row.updatedAt.toISOString(),
      })),
    };
  }

  async listForApplication(user: AuthUser, applicationId: string) {
    assertViewApplicationValuations(user);
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: { assets: true },
    });
    if (!application) throw notFound("Application not found");
    await Promise.all(
      application.assets.map((asset) =>
        this.prisma.valuation.upsert({
          where: { assetId: asset.id },
          create: {
            applicationId,
            assetId: asset.id,
            status: ValuationStatus.REQUESTED,
          },
          update: {},
        }),
      ),
    );
    const staff = await this.prisma.user.findMany({
      where: {
        status: "ACTIVE",
        role: { in: [BusinessRole.LOAN_OFFICER, BusinessRole.VALUATION_OFFICER] },
      },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: "asc" },
    });
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
      loanOfficers: staff.filter((row) => row.role === BusinessRole.LOAN_OFFICER),
      valuationOfficers: staff.filter((row) => row.role === BusinessRole.VALUATION_OFFICER),
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
    const valuation = await this.prisma.valuation.findUnique({
      where: { id: valuationId },
      include: { application: true },
    });
    if (!valuation) throw notFound("Valuation not found");
    const draftWizard = valuation.application.status === ApplicationStatus.DRAFT;
    assertCompleteApplicationValuation(user, draftWizard);
    if (valuation.version !== input.expectedVersion) {
      throw conflict("This valuation was updated elsewhere. Reload and try again.");
    }
    if (!input.borrowerPresent) {
      throw validation("Borrower participation must be recorded to complete valuation", {
        borrowerPresent: ["Confirm borrower was present"],
      });
    }
    let loanOfficerId = input.loanOfficerId;
    let valuationOfficerId = input.valuationOfficerId;
    if (draftWizard) {
      if (!loanOfficerId && user.role === BusinessRole.LOAN_OFFICER) {
        loanOfficerId = user.id;
      }
      if (!valuationOfficerId) {
        const fallback = await this.prisma.user.findFirst({
          where: { status: "ACTIVE", role: BusinessRole.VALUATION_OFFICER },
          select: { id: true },
        });
        valuationOfficerId = fallback?.id ?? valuationOfficerId;
      }
    }
    const loanOfficer = await this.prisma.user.findUnique({ where: { id: loanOfficerId } });
    const valuationOfficer = await this.prisma.user.findUnique({
      where: { id: valuationOfficerId },
    });
    if (!loanOfficer || loanOfficer.role !== BusinessRole.LOAN_OFFICER) {
      throw validation("Select a loan officer");
    }
    if (!valuationOfficer || valuationOfficer.role !== BusinessRole.VALUATION_OFFICER) {
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
        loanOfficerId,
        valuationOfficerId,
        participatedAt: new Date(input.participatedAt),
        version: { increment: 1 },
      },
    });
    await this.prisma.applicationAsset.update({
      where: { id: valuation.assetId },
      data: { status: AssetStatus.VALUED },
    });
    // Keep the existing valuation.complete event (including basis) instead of
    // writing a second asset.valuation row for the same completion.
    await this.audit.write({
      actorId: user.id,
      action: "valuation.complete",
      objectType: "Valuation",
      objectId: row.id,
      after: { status: row.status, amount: row.amount, basis: row.basis },
    });
    return row;
  }
}
