import { Inject, Injectable } from "@nestjs/common";
import {
  ApplicationDetail,
  ApplicationStatus,
  ApplicationStep,
  ApplicationSummary,
  CursorListQuery,
  PatchApplicationInput,
  SaveAssetInput,
  SaveBorrowerInput,
  SaveTermsInput,
  ValuationStatus,
} from "@toumua/contracts";
import { AuthUser } from "../auth/session";
import { conflict, forbidden, notFound, validation } from "../common/http";
import { AuditService } from "../audit/audit.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { assertManageLending } from "./access";
import { NumbersService } from "./numbers.service";
import {
  attachReadiness,
  buildReadiness,
  isReadyForCustomerSubmit,
  isReadyForStaffSubmit,
} from "./readiness";
import { buildTermsPreview, termsPolicyConfigured } from "./calculation-policy";
import { toCents } from "./money";
import { UploadsService } from "./uploads.service";

@Injectable()
export class ApplicationsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(NumbersService) private readonly numbers: NumbersService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(UploadsService) private readonly uploads: UploadsService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
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

  async createForCustomer(user: AuthUser, input: SaveBorrowerInput) {
    const borrower = await this.upsertCustomerBorrower(user, input);
    const draft = await this.prisma.application.findFirst({
      where: { borrowerId: borrower.id, status: ApplicationStatus.DRAFT },
      orderBy: { updatedAt: "desc" },
    });
    if (draft) {
      return this.toCustomerDetail(draft.id);
    }
    const number = await this.numbers.nextApplicationNumber();
    const row = await this.prisma.application.create({
      data: {
        number,
        borrowerId: borrower.id,
        createdById: user.id,
        terms: { create: {} },
      },
    });
    await this.audit.write({
      actorId: user.id,
      action: "application.create",
      objectType: "Application",
      objectId: row.id,
      after: { id: row.id, number: row.number, source: "customer" },
    });
    return this.toCustomerDetail(row.id);
  }

  async getBorrowerForCustomer(userId: string) {
    const link = await this.prisma.borrowerAccountLink.findFirst({
      where: { userId, status: "ACTIVE" },
      include: {
        borrower: {
          select: { id: true, name: true, phone: true, address: true, email: true },
        },
      },
    });
    return { borrower: link?.borrower ?? null };
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
    const existing = await this.assertEditor(user, id);
    if (existing.version !== input.expectedVersion) {
      throw conflict("This application was updated elsewhere. Reload and try again.");
    }
    if (user.isStaff && input.borrowerId) {
      const borrower = await this.prisma.borrower.findUnique({ where: { id: input.borrowerId } });
      if (!borrower) throw notFound("Borrower not found");
    }
    const row = await this.prisma.application.update({
      where: { id },
      data: {
        version: { increment: 1 },
        ...(input.currentStep ? { currentStep: input.currentStep } : {}),
        ...(user.isStaff && input.borrowerId !== undefined ? { borrowerId: input.borrowerId } : {}),
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
    return user.isStaff ? this.loadDetail(row.id) : this.toCustomerDetail(row.id);
  }

  async saveTerms(user: AuthUser, id: string, input: SaveTermsInput) {
    assertManageLending(user);
    const application = await this.prisma.application.findUnique({
      where: { id },
      include: { terms: true },
    });
    if (!application) throw notFound("Application not found");
    if (
      application.status !== ApplicationStatus.DRAFT &&
      application.status !== ApplicationStatus.SUBMITTED
    ) {
      throw conflict("Only draft or submitted applications can have terms updated");
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
    await this.assertEditor(user, applicationId);
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
    return user.isStaff ? this.loadDetail(applicationId) : this.toCustomerDetail(applicationId);
  }

  async updateAsset(
    user: AuthUser,
    applicationId: string,
    assetId: string,
    input: SaveAssetInput,
  ) {
    await this.assertEditor(user, applicationId);
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
    return user.isStaff ? this.loadDetail(applicationId) : this.toCustomerDetail(applicationId);
  }

  async deleteAsset(user: AuthUser, applicationId: string, assetId: string) {
    await this.assertEditor(user, applicationId);
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
    return user.isStaff ? this.loadDetail(applicationId) : this.toCustomerDetail(applicationId);
  }

  async submit(user: AuthUser, id: string, expectedVersion: number) {
    const application = user.isStaff
      ? await this.assertStaffApplication(user, id)
      : await this.assertCustomerOwns(user.id, id);
    if (application.status !== ApplicationStatus.DRAFT) {
      throw conflict("This application has already been submitted");
    }
    if (application.version !== expectedVersion) {
      throw conflict("This application was updated elsewhere. Reload and try again.");
    }
    const readiness = buildReadiness(await this.loadRaw(id));
    const ready = user.isStaff
      ? isReadyForStaffSubmit(readiness)
      : isReadyForCustomerSubmit(readiness);
    if (!ready) {
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
      after: { status: row.status, submittedAt: row.submittedAt, source: user.isStaff ? "staff" : "customer" },
    });
    if (!user.isStaff) {
      await this.notifications.notifyLendingStaff(
        "New customer application",
        `${application.number} is ready for review.`,
        `/staff/applications/${row.id}/edit/review`,
      );
      await this.notifications.notify(
        user.id,
        "Application submitted",
        "We received your application. Our team will review it shortly.",
        `/customer/applications/${row.id}`,
      );
    }
    return user.isStaff ? this.loadDetail(row.id) : this.toCustomerDetail(row.id);
  }

  async listForCustomer(userId: string) {
    const link = await this.prisma.borrowerAccountLink.findFirst({
      where: { userId, status: "ACTIVE" },
    });
    if (!link) {
      return { items: [], nextCursor: null, total: 0 };
    }
    const items = await this.prisma.application.findMany({
      where: { borrowerId: link.borrowerId },
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
    await this.assertCustomerOwns(userId, id);
    return this.toCustomerDetail(id);
  }

  private customerStages(status: string) {
    const submitted = status !== ApplicationStatus.DRAFT;
    const decided =
      status === ApplicationStatus.APPROVED || status === ApplicationStatus.DECLINED;
    const approved = status === ApplicationStatus.APPROVED;
    return [
      { id: "application", label: "Application submitted", complete: submitted },
      { id: "review", label: "Staff review", complete: decided },
      { id: "decision", label: "Manager decision", complete: decided },
      { id: "intake", label: "Collateral intake", complete: approved },
      { id: "disbursement", label: "Disbursement", complete: false },
    ].map((stage) =>
      status === ApplicationStatus.DECLINED && stage.id !== "decision"
        ? { ...stage, complete: false, pending: false }
        : stage,
    );
  }

  private async assertStaffApplication(user: AuthUser, id: string) {
    assertManageLending(user);
    const application = await this.prisma.application.findUnique({ where: { id } });
    if (!application) throw notFound("Application not found");
    return application;
  }

  private async assertCustomerOwns(userId: string, applicationId: string) {
    const link = await this.prisma.borrowerAccountLink.findFirst({
      where: { userId, status: "ACTIVE" },
    });
    if (!link) throw forbidden();
    const application = await this.prisma.application.findFirst({
      where: { id: applicationId, borrowerId: link.borrowerId },
    });
    if (!application) throw notFound("Application not found");
    return application;
  }

  private async assertEditor(user: AuthUser, applicationId: string) {
    if (user.isStaff) {
      assertManageLending(user);
      return this.assertDraft(applicationId);
    }
    const application = await this.assertCustomerOwns(user.id, applicationId);
    if (application.status !== ApplicationStatus.DRAFT) {
      throw conflict("Only draft applications can be edited");
    }
    return application;
  }

  private async upsertCustomerBorrower(user: AuthUser, input: SaveBorrowerInput) {
    const link = await this.prisma.borrowerAccountLink.findFirst({
      where: { userId: user.id, status: "ACTIVE" },
    });
    const data = {
      name: input.name.trim(),
      phone: input.phone.trim(),
      address: input.address.trim(),
      email: input.email?.trim() || user.email,
    };
    if (link) {
      return this.prisma.borrower.update({ where: { id: link.borrowerId }, data });
    }
    const number = await this.numbers.nextBorrowerNumber();
    const borrower = await this.prisma.borrower.create({
      data: {
        number,
        ...data,
        createdById: user.id,
      },
    });
    await this.prisma.borrowerAccountLink.create({
      data: {
        borrowerId: borrower.id,
        userId: user.id,
        verificationMethod: "customer_self_apply",
        notes: "Created when the customer started an online application",
        linkedById: user.id,
      },
    });
    return borrower;
  }

  private async toCustomerDetail(id: string) {
    const detail = await this.loadDetail(id);
    const row = await this.prisma.application.findUnique({
      where: { id },
      include: {
        borrower: {
          select: { id: true, name: true, phone: true, address: true, email: true },
        },
      },
    });
    if (!row) throw notFound("Application not found");
    return {
      ...detail,
      borrower: row.borrower,
      stages: this.customerStages(row.status),
      publicNote:
        row.status === ApplicationStatus.DECLINED
          ? "Your application was not approved. Contact our team if you have questions."
          : null,
    };
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
        valuationAmount:
          asset.valuations[0]?.status === ValuationStatus.COMPLETED
            ? toCents(asset.valuations[0].amount ?? "0")
            : 0,
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
        valuationAmount:
          asset.valuations[0]?.status === ValuationStatus.COMPLETED
            ? toCents(asset.valuations[0].amount ?? "0")
            : 0,
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
        photos: asset.photos.map((photo) => ({
          id: photo.id,
          url: `/api/v1/photos/${photo.id}/file`,
        })),
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
