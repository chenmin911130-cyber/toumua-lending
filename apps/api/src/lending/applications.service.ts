import { Inject, Injectable } from "@nestjs/common";
import {
  ApplicationDetail,
  ApplicationStatus,
  ApplicationStep,
  ApplicationSummary,
  CursorListQuery,
  PatchApplicationInput,
  SaveAssetInput,
  SaveTermsInput,
  ValuationStatus,
} from "@toumua/contracts";
import { AuthUser } from "../auth/session";
import { conflict, forbidden, notFound, validation } from "../common/http";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { assertManageLending } from "./access";
import { NumbersService } from "./numbers.service";
import { attachReadiness, buildReadiness, isReadyToSubmit } from "./readiness";
import { buildTermsPreview, termsPolicyConfigured } from "./calculation-policy";
import { UploadsService } from "./uploads.service";

@Injectable()
export class ApplicationsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(NumbersService) private readonly numbers: NumbersService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(UploadsService) private readonly uploads: UploadsService,
  ) {}

  async list(user: AuthUser, query: CursorListQuery) {
    assertManageLending(user);
    const limit = query.limit ?? 20;
    const q = (query.q ?? "").trim();
    const where: Record<string, unknown> = {};
    if (query.status && query.status !== "ALL") {
      where.status = query.status;
    }
    if (q.length >= 1) {
      where.OR = [
        { number: { contains: q, mode: "insensitive" } },
        { borrower: { name: { contains: q, mode: "insensitive" } } },
      ];
    }
    const items = await this.prisma.application.findMany({
      where,
      take: limit + 1,
      ...(query.cursor ? { skip: 1, cursor: { id: query.cursor } } : {}),
      orderBy: { updatedAt: "desc" },
      include: { borrower: { select: { name: true } } },
    });
    const next = items.length > limit ? items.pop() : null;
    const total = await this.prisma.application.count({ where });
    return {
      items: items.map((row) => this.toSummary(row)),
      nextCursor: next?.id ?? null,
      total,
    };
  }

  async create(user: AuthUser, borrowerId?: string) {
    assertManageLending(user);
    if (borrowerId) {
      const borrower = await this.prisma.borrower.findUnique({ where: { id: borrowerId } });
      if (!borrower) throw notFound("Borrower not found");
    }
    const number = await this.numbers.nextApplicationNumber();
    const row = await this.prisma.application.create({
      data: {
        number,
        borrowerId: borrowerId ?? null,
        createdById: user.id,
        terms: { create: {} },
      },
    });
    await this.audit.write({
      actorId: user.id,
      action: "application.create",
      objectType: "Application",
      objectId: row.id,
      after: { id: row.id, number: row.number },
    });
    return this.get(user, row.id);
  }

  async get(user: AuthUser, id: string) {
    assertManageLending(user);
    return this.loadDetail(id);
  }

  async getReadiness(user: AuthUser, id: string) {
    assertManageLending(user);
    const raw = await this.loadRaw(id);
    return { items: buildReadiness(raw) };
  }

  async patch(user: AuthUser, id: string, input: PatchApplicationInput) {
    assertManageLending(user);
    const existing = await this.prisma.application.findUnique({ where: { id } });
    if (!existing) throw notFound("Application not found");
    if (existing.status !== ApplicationStatus.DRAFT) {
      throw conflict("Only draft applications can be edited");
    }
    if (existing.version !== input.expectedVersion) {
      throw conflict("This application was updated elsewhere. Reload and try again.");
    }
    if (input.borrowerId) {
      const borrower = await this.prisma.borrower.findUnique({ where: { id: input.borrowerId } });
      if (!borrower) throw notFound("Borrower not found");
    }
    const row = await this.prisma.application.update({
      where: { id },
      data: {
        version: { increment: 1 },
        ...(input.currentStep ? { currentStep: input.currentStep } : {}),
        ...(input.borrowerId !== undefined ? { borrowerId: input.borrowerId } : {}),
        ...(input.requestedAmount !== undefined
          ? { requestedAmount: input.requestedAmount }
          : {}),
        ...(input.purpose !== undefined ? { purpose: input.purpose } : {}),
        ...(input.purposeDescription !== undefined
          ? { purposeDescription: input.purposeDescription }
          : {}),
        ...(input.proposedTermMonths !== undefined
          ? { proposedTermMonths: input.proposedTermMonths }
          : {}),
      },
    });
    await this.audit.write({
      actorId: user.id,
      action: "application.update",
      objectType: "Application",
      objectId: row.id,
      before: { version: existing.version },
      after: { version: row.version, currentStep: row.currentStep },
    });
    return this.loadDetail(row.id);
  }

  async saveTerms(user: AuthUser, id: string, input: SaveTermsInput) {
    assertManageLending(user);
    const application = await this.prisma.application.findUnique({
      where: { id },
      include: { terms: true },
    });
    if (!application) throw notFound("Application not found");
    if (application.status !== ApplicationStatus.DRAFT) {
      throw conflict("Only draft applications can be edited");
    }
    if (application.version !== input.expectedVersion) {
      throw conflict("This application was updated elsewhere. Reload and try again.");
    }
    const firstPaymentDate = input.firstPaymentDate
      ? new Date(input.firstPaymentDate)
      : null;
    const policyConfigured = termsPolicyConfigured(input);
    const previewJson = buildTermsPreview(input, application.requestedAmount);
    await this.prisma.$transaction(async (tx) => {
      // Re-check the version inside the transaction so two concurrent saves
      // cannot both pass the earlier check and silently overwrite each other.
      const locked = await tx.application.updateMany({
        where: { id, version: input.expectedVersion },
        data: { version: { increment: 1 } },
      });
      if (locked.count === 0) {
        throw conflict("This application was updated elsewhere. Reload and try again.");
      }
      await tx.applicationTerms.upsert({
        where: { applicationId: id },
        create: {
          applicationId: id,
          firstPaymentDate,
          frequency: input.frequency ?? null,
          periods: input.periods ?? null,
          interestMethod: input.interestMethod ?? null,
          policyConfigured,
          previewJson: previewJson ?? undefined,
          version: 1,
        },
        update: {
          firstPaymentDate,
          frequency: input.frequency ?? null,
          periods: input.periods ?? null,
          interestMethod: input.interestMethod ?? null,
          policyConfigured,
          previewJson: previewJson ?? undefined,
          version: { increment: 1 },
        },
      });
    });
    return this.loadDetail(id);
  }

  async schedulePreview(user: AuthUser, id: string, input: SaveTermsInput) {
    assertManageLending(user);
    const application = await this.prisma.application.findUnique({ where: { id } });
    if (!application) throw notFound("Application not found");
    const preview = buildTermsPreview(input, application.requestedAmount);
    if (!preview) {
      throw validation("Complete repayment terms before requesting a preview");
    }
    return { preview };
  }

  async addAsset(user: AuthUser, applicationId: string, input: SaveAssetInput) {
    assertManageLending(user);
    await this.assertDraft(applicationId);
    const count = await this.prisma.applicationAsset.count({ where: { applicationId } });
    const asset = await this.prisma.applicationAsset.create({
      data: {
        applicationId,
        name: input.name.trim(),
        description: input.description.trim(),
        condition: input.condition.trim(),
        category: input.category?.trim() || null,
        identifier: input.identifier?.trim() || null,
        sortOrder: count,
      },
    });
    await this.prisma.application.update({
      where: { id: applicationId },
      data: { version: { increment: 1 } },
    });
    await this.ensureValuation(applicationId, asset.id);
    return this.loadDetail(applicationId);
  }

  async updateAsset(
    user: AuthUser,
    applicationId: string,
    assetId: string,
    input: SaveAssetInput,
  ) {
    assertManageLending(user);
    await this.assertDraft(applicationId);
    const asset = await this.prisma.applicationAsset.findFirst({
      where: { id: assetId, applicationId },
    });
    if (!asset) throw notFound("Asset not found");
    await this.prisma.applicationAsset.update({
      where: { id: assetId },
      data: {
        name: input.name.trim(),
        description: input.description.trim(),
        condition: input.condition.trim(),
        category: input.category?.trim() || null,
        identifier: input.identifier?.trim() || null,
      },
    });
    await this.prisma.application.update({
      where: { id: applicationId },
      data: { version: { increment: 1 } },
    });
    await this.invalidateValuationIfCompleted(assetId);
    return this.loadDetail(applicationId);
  }

  async deleteAsset(user: AuthUser, applicationId: string, assetId: string) {
    assertManageLending(user);
    await this.assertDraft(applicationId);
    const asset = await this.prisma.applicationAsset.findFirst({
      where: { id: assetId, applicationId },
    });
    if (!asset) throw notFound("Asset not found");
    const photos = await this.prisma.assetPhoto.findMany({
      where: { assetId },
      select: { storageKey: true },
    });
    await this.prisma.applicationAsset.delete({ where: { id: assetId } });
    this.uploads.removeFilesForAsset(photos.map((photo) => photo.storageKey));
    await this.prisma.application.update({
      where: { id: applicationId },
      data: { version: { increment: 1 } },
    });
    return this.loadDetail(applicationId);
  }

  async submit(user: AuthUser, id: string, expectedVersion: number) {
    assertManageLending(user);
    const application = await this.prisma.application.findUnique({ where: { id } });
    if (!application) throw notFound("Application not found");
    if (application.status !== ApplicationStatus.DRAFT) {
      throw conflict("This application has already been submitted");
    }
    if (application.version !== expectedVersion) {
      throw conflict("This application was updated elsewhere. Reload and try again.");
    }
    const readiness = buildReadiness(await this.loadRaw(id));
    if (!isReadyToSubmit(readiness)) {
      throw validation("Complete all required steps before submitting");
    }
    const row = await this.prisma.application.update({
      where: { id },
      data: {
        status: ApplicationStatus.SUBMITTED,
        currentStep: ApplicationStep.REVIEW,
        submittedAt: new Date(),
        version: { increment: 1 },
      },
    });
    await this.audit.write({
      actorId: user.id,
      action: "application.submit",
      objectType: "Application",
      objectId: row.id,
      after: { status: row.status, submittedAt: row.submittedAt },
    });
    return this.loadDetail(row.id);
  }

  async listForCustomer(userId: string) {
    const link = await this.prisma.borrowerAccountLink.findFirst({
      where: { userId, status: "ACTIVE" },
    });
    if (!link) {
      return { items: [], nextCursor: null, total: 0 };
    }
    const items = await this.prisma.application.findMany({
      where: {
        borrowerId: link.borrowerId,
        status: { not: ApplicationStatus.DRAFT },
      },
      orderBy: { updatedAt: "desc" },
      include: { borrower: { select: { name: true } } },
    });
    return {
      items: items.map((row) => ({
        ...this.toSummary(row),
        stages: this.customerStages(row.status),
      })),
      nextCursor: null,
      total: items.length,
    };
  }

  async getForCustomer(userId: string, id: string) {
    const link = await this.prisma.borrowerAccountLink.findFirst({
      where: { userId, status: "ACTIVE" },
    });
    if (!link) throw forbidden();
    const row = await this.prisma.application.findFirst({
      where: {
        id,
        borrowerId: link.borrowerId,
        status: { not: ApplicationStatus.DRAFT },
      },
      include: { borrower: { select: { name: true } } },
    });
    if (!row) throw notFound("Application not found");
    return {
      ...this.toSummary(row),
      purposeDescription: row.purposeDescription,
      stages: this.customerStages(row.status),
      publicNote:
        row.status === ApplicationStatus.DECLINED
          ? "Your application was not approved. Contact our team if you have questions."
          : null,
    };
  }

  private customerStages(status: string) {
    const submitted = status !== ApplicationStatus.DRAFT;
    const decided =
      status === ApplicationStatus.APPROVED || status === ApplicationStatus.DECLINED;
    const approved = status === ApplicationStatus.APPROVED;
    return [
      { id: "application", label: "Application submitted", complete: submitted },
      { id: "valuation", label: "Valuation", complete: submitted },
      { id: "decision", label: "Manager decision", complete: decided },
      { id: "intake", label: "Collateral intake", complete: false },
      { id: "disbursement", label: "Disbursement", complete: false },
    ].map((stage) =>
      status === ApplicationStatus.DECLINED && stage.id !== "decision"
        ? { ...stage, complete: false, pending: false }
        : stage,
    );
  }

  private async assertDraft(applicationId: string) {
    const application = await this.prisma.application.findUnique({ where: { id: applicationId } });
    if (!application) throw notFound("Application not found");
    if (application.status !== ApplicationStatus.DRAFT) {
      throw conflict("Only draft applications can be edited");
    }
    return application;
  }

  private async ensureValuation(applicationId: string, assetId: string) {
    await this.prisma.valuation.upsert({
      where: { assetId },
      create: { applicationId, assetId, status: ValuationStatus.REQUESTED },
      update: {},
    });
  }

  private async invalidateValuationIfCompleted(assetId: string) {
    const valuation = await this.prisma.valuation.findUnique({ where: { assetId } });
    if (valuation?.status === ValuationStatus.COMPLETED) {
      await this.prisma.valuation.update({
        where: { assetId },
        data: {
          status: ValuationStatus.REQUESTED,
          amount: null,
          valuationDate: null,
          basis: null,
          borrowerPresent: null,
          loanOfficerId: null,
          valuationOfficerId: null,
          participatedAt: null,
          version: { increment: 1 },
        },
      });
    }
  }

  private async loadRaw(id: string) {
    const row = await this.prisma.application.findUnique({
      where: { id },
      include: {
        assets: {
          orderBy: { sortOrder: "asc" },
          include: {
            photos: true,
            valuations: true,
          },
        },
        terms: true,
      },
    });
    if (!row) throw notFound("Application not found");
    return {
      id: row.id,
      status: row.status,
      borrowerId: row.borrowerId,
      requestedAmount: row.requestedAmount,
      purpose: row.purpose,
      proposedTermMonths: row.proposedTermMonths,
      assets: row.assets.map((asset) => ({
        id: asset.id,
        name: asset.name,
        photoCount: asset.photos.length,
        valuationStatus: asset.valuations[0]?.status ?? null,
      })),
      terms: row.terms
        ? {
            firstPaymentDate: row.terms.firstPaymentDate,
            frequency: row.terms.frequency,
            periods: row.terms.periods,
            policyConfigured: row.terms.policyConfigured,
          }
        : null,
    };
  }

  private async loadDetail(id: string): Promise<ApplicationDetail> {
    const row = await this.prisma.application.findUnique({
      where: { id },
      include: {
        borrower: { select: { name: true } },
        assets: {
          orderBy: { sortOrder: "asc" },
          include: {
            photos: true,
            valuations: true,
          },
        },
        terms: true,
      },
    });
    if (!row) throw notFound("Application not found");
    const raw = {
      id: row.id,
      status: row.status,
      borrowerId: row.borrowerId,
      requestedAmount: row.requestedAmount,
      purpose: row.purpose,
      proposedTermMonths: row.proposedTermMonths,
      assets: row.assets.map((asset) => ({
        id: asset.id,
        name: asset.name,
        photoCount: asset.photos.length,
        valuationStatus: asset.valuations[0]?.status ?? null,
      })),
      terms: row.terms
        ? {
            firstPaymentDate: row.terms.firstPaymentDate,
            frequency: row.terms.frequency,
            periods: row.terms.periods,
            policyConfigured: row.terms.policyConfigured,
          }
        : null,
    };
    const detail: Omit<ApplicationDetail, "readiness"> = {
      ...this.toSummary(row),
      purposeDescription: row.purposeDescription,
      proposedTermMonths: row.proposedTermMonths,
      assets: row.assets.map((asset) => ({
        id: asset.id,
        name: asset.name,
        description: asset.description,
        condition: asset.condition,
        category: asset.category,
        identifier: asset.identifier,
        photoCount: asset.photos.length,
        valuationStatus: (asset.valuations[0]?.status as ValuationStatus | undefined) ?? null,
      })),
      terms: row.terms
        ? {
            firstPaymentDate: row.terms.firstPaymentDate?.toISOString() ?? null,
            frequency: row.terms.frequency,
            periods: row.terms.periods,
            interestMethod: row.terms.interestMethod,
            policyConfigured: row.terms.policyConfigured,
            previewAvailable: Boolean(row.terms.previewJson),
          }
        : null,
    };
    return attachReadiness(detail, raw);
  }

  private toSummary(row: {
    id: string;
    number: string;
    status: string;
    currentStep: string;
    version: number;
    borrowerId: string | null;
    requestedAmount: string | null;
    purpose: string | null;
    submittedAt: Date | null;
    updatedAt: Date;
    borrower?: { name: string } | null;
  }): ApplicationSummary {
    return {
      id: row.id,
      number: row.number,
      status: row.status as ApplicationSummary["status"],
      currentStep: row.currentStep as ApplicationSummary["currentStep"],
      version: row.version,
      borrowerId: row.borrowerId,
      borrowerName: row.borrower?.name ?? null,
      requestedAmount: row.requestedAmount,
      purpose: row.purpose,
      submittedAt: row.submittedAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
