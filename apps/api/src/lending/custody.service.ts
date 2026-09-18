import { Inject, Injectable } from "@nestjs/common";
import {
  AssetStatus,
  AssetView,
  CorrectionStatus,
  CustodyEventType,
  CustodyUpdateInput,
  CursorListQuery,
  IntakeInput,
  LoanStatus,
  ReturnInput,
  SaleDraftInput,
  SaleInput,
  ValuationStatus,
} from "@toumua/contracts";
import { AuthUser } from "../auth/session";
import { conflict, notFound, validation } from "../common/http";
import { AuditService } from "../audit/audit.service";
import { Prisma } from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import { assertManageCustody, assertReadLedger } from "./access";
import { outstanding } from "./calculation-policy";

@Injectable()
export class CustodyService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser, query: CursorListQuery) {
    assertReadLedger(user);
    const limit = query.limit ?? 20;
    const q = (query.q ?? "").trim();
    const where =
      q.length >= 1
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { identifier: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {};
    const items = await this.prisma.applicationAsset.findMany({
      where: {
        ...where,
        application: { loan: { isNot: null } },
      },
      take: limit + 1,
      ...(query.cursor ? { skip: 1, cursor: { id: query.cursor } } : {}),
      orderBy: { updatedAt: "desc" },
      include: {
        application: {
          select: {
            id: true,
            number: true,
            loan: { include: { schedule: { orderBy: { number: "asc" as const } } } },
          },
        },
        photos: true,
        valuations: true,
        custody: { orderBy: { createdAt: "asc" }, include: { recordedBy: { select: { name: true } } } },
      },
    });
    const next = items.length > limit ? items.pop() : null;
    const total = await this.prisma.applicationAsset.count({
      where: { ...where, application: { loan: { isNot: null } } },
    });
    return {
      items: items.map((row) => this.toAssetView(row)),
      nextCursor: next?.id ?? null,
      total,
    };
  }

  async get(user: AuthUser, assetId: string): Promise<AssetView> {
    assertReadLedger(user);
    const asset = await this.loadAsset(assetId);
    return this.toAssetView(asset);
  }

  async intake(user: AuthUser, assetId: string, input: IntakeInput) {
    assertManageCustody(user);
    const asset = await this.loadAsset(assetId);
    const loan = asset.application.loan;
    if (!loan) throw conflict("This asset is not on an approved loan");
    if (loan.version !== input.expectedVersion) {
      throw conflict("This loan was updated elsewhere. Reload and try again.");
    }
    const valuation = asset.valuations[0];
    if (!valuation || valuation.status !== ValuationStatus.COMPLETED) {
      throw validation("Complete valuation before intake");
    }
    if (asset.status === AssetStatus.STORED) {
      throw conflict("This asset has already been stored");
    }

    const receivedOn = new Date(input.receivedOn);
    const inspectedOn = new Date(input.inspectedOn);

    await this.prisma.$transaction(async (tx) => {
      await tx.custodyEvent.create({
        data: {
          assetId,
          loanId: loan.id,
          type: CustodyEventType.RECEIVED,
          businessDate: receivedOn,
          recordedById: user.id,
        },
      });
      await tx.custodyEvent.create({
        data: {
          assetId,
          loanId: loan.id,
          type: CustodyEventType.INSPECTED,
          businessDate: inspectedOn,
          inspectionResult: input.inspectionResult,
          conditionNote: input.inspectionNote ?? null,
          recordedById: user.id,
        },
      });
      if (input.inspectionResult === "PASS") {
        await tx.custodyEvent.create({
          data: {
            assetId,
            loanId: loan.id,
            type: CustodyEventType.STORED,
            businessDate: inspectedOn,
            location: input.location ?? null,
            conditionNote: input.conditionNote ?? null,
            recordedById: user.id,
          },
        });
        await tx.applicationAsset.update({
          where: { id: assetId },
          data: { status: AssetStatus.STORED },
        });
      } else {
        await tx.applicationAsset.update({
          where: { id: assetId },
          data: { status: AssetStatus.VALUED },
        });
      }
      await tx.loan.update({
        where: { id: loan.id },
        data: { version: { increment: 1 } },
      });
      await this.audit.write(
        {
          actorId: user.id,
          action: "asset.intake",
          objectType: "ApplicationAsset",
          objectId: assetId,
          after: { inspectionResult: input.inspectionResult },
        },
        tx,
      );
    });

    // Custody staff may record intake without ledger read access; return the
    // refreshed asset directly instead of routing through get().
    const refreshed = await this.loadAsset(assetId);
    return this.toAssetView(refreshed);
  }

  async updateCustody(user: AuthUser, assetId: string, input: CustodyUpdateInput) {
    assertManageCustody(user);
    const asset = await this.loadAsset(assetId);
    const loan = asset.application.loan;
    if (!loan) throw conflict("This asset is not on an approved loan");
    if (asset.status !== AssetStatus.STORED) {
      throw validation("Only stored assets can be relocated");
    }
    if (loan.version !== input.expectedVersion) {
      throw conflict("This loan was updated elsewhere. Reload and try again.");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.custodyEvent.create({
        data: {
          assetId,
          loanId: loan.id,
          type: CustodyEventType.RELOCATED,
          businessDate: new Date(),
          location: input.location,
          conditionNote: input.conditionNote ?? null,
          reason: input.reason,
          recordedById: user.id,
        },
      });
      await tx.loan.update({ where: { id: loan.id }, data: { version: { increment: 1 } } });
    });

    const refreshed = await this.loadAsset(assetId);
    return this.toAssetView(refreshed);
  }

  async saveSaleDraft(user: AuthUser, assetId: string, input: SaleDraftInput) {
    assertManageCustody(user);
    const asset = await this.loadAsset(assetId);
    this.assertSaleEligible(asset);
    await this.prisma.applicationAsset.update({
      where: { id: assetId },
      data: { saleDraft: input },
    });
    return this.toAssetView(await this.loadAsset(assetId));
  }

  async confirmSale(user: AuthUser, assetId: string, input: SaleInput) {
    assertManageCustody(user);
    const asset = await this.loadAsset(assetId);
    const loan = asset.application.loan;
    if (!loan) throw conflict("This asset is not on an approved loan");
    if (loan.version !== input.expectedVersion) {
      throw conflict("This loan was updated elsewhere. Reload and try again.");
    }
    this.assertSaleEligible(asset);
    if (input.receiptId) {
      const receipt = await this.prisma.receipt.findFirst({
        where: {
          id: input.receiptId,
          loanId: loan.id,
          ledgerEntry: { type: "SALE_RECEIPT" },
        },
      });
      if (!receipt) {
        throw validation("Select a sale proceeds receipt for this loan", {
          receiptId: ["Receipt not found or not a sale proceeds entry"],
        });
      }
    }
    const businessDate = new Date(input.saleDate);
    await this.prisma.$transaction(async (tx) => {
      await tx.custodyEvent.create({
        data: {
          assetId,
          loanId: loan.id,
          type: CustodyEventType.SOLD,
          businessDate,
          reason: JSON.stringify({
            buyerName: input.buyerName,
            buyerContact: input.buyerContact,
            saleAmount: input.saleAmount,
            method: input.method,
            notes: input.notes ?? null,
            receiptId: input.receiptId ?? null,
          }),
          recordedById: user.id,
        },
      });
      await tx.applicationAsset.update({
        where: { id: assetId },
        data: { status: AssetStatus.SOLD, saleDraft: Prisma.DbNull },
      });
      await tx.loan.update({
        where: { id: loan.id },
        data: { version: { increment: 1 } },
      });
      await this.audit.write(
        {
          actorId: user.id,
          action: "asset.sale",
          objectType: "ApplicationAsset",
          objectId: assetId,
          after: { status: AssetStatus.SOLD, saleAmount: input.saleAmount },
        },
        tx,
      );
    });
    return this.toAssetView(await this.loadAsset(assetId));
  }

  async returnAsset(user: AuthUser, assetId: string, input: ReturnInput) {
    assertManageCustody(user);
    const asset = await this.loadAsset(assetId);
    const loan = asset.application.loan;
    if (!loan) throw conflict("This asset is not on an approved loan");
    if (loan.version !== input.expectedVersion) {
      throw conflict("This loan was updated elsewhere. Reload and try again.");
    }
    await this.assertReturnEligible(assetId, loan.id);
    const returnedOn = new Date(input.returnedOn);
    await this.prisma.$transaction(async (tx) => {
      await tx.custodyEvent.create({
        data: {
          assetId,
          loanId: loan.id,
          type: CustodyEventType.RETURNED,
          businessDate: returnedOn,
          conditionNote: input.conditionNote ?? null,
          reason: JSON.stringify({
            recipientName: input.recipientName,
            verificationMethod: input.verificationMethod,
          }),
          recordedById: user.id,
        },
      });
      await tx.applicationAsset.update({
        where: { id: assetId },
        data: { status: AssetStatus.RETURNED },
      });
      await tx.loan.update({
        where: { id: loan.id },
        data: { version: { increment: 1 } },
      });
      await this.audit.write(
        {
          actorId: user.id,
          action: "asset.return",
          objectType: "ApplicationAsset",
          objectId: assetId,
          after: { status: AssetStatus.RETURNED },
        },
        tx,
      );
    });
    return this.toAssetView(await this.loadAsset(assetId));
  }

  private assertSaleEligible(asset: Awaited<ReturnType<CustodyService["loadAsset"]>>) {
    const loan = asset.application.loan;
    if (!loan || loan.status !== LoanStatus.DEFAULTED) {
      throw validation("Sale can only be recorded on a defaulted loan");
    }
    if (asset.status !== AssetStatus.STORED) {
      throw validation("Only stored assets can be sold");
    }
  }

  private async assertReturnEligible(assetId: string, loanId: string) {
    const loan = await this.prisma.loan.findUnique({
      where: { id: loanId },
      include: { schedule: { orderBy: { number: "asc" } } },
    });
    if (!loan) throw notFound("Loan not found");
    if (loan.status !== LoanStatus.SETTLED) {
      throw validation("Return requires a settled loan");
    }
    const balance = outstanding(
      loan.schedule.map((entry) => ({
        id: entry.id,
        number: entry.number,
        amount: entry.amount,
        paidAmount: entry.paidAmount,
      })),
    );
    if (balance !== "0.00") {
      throw validation("Return requires a zero balance", {
        balance: [`Outstanding balance is ${balance}`],
      });
    }
    const asset = await this.prisma.applicationAsset.findUnique({ where: { id: assetId } });
    if (!asset || asset.status !== AssetStatus.STORED) {
      throw validation("Only stored assets can be returned");
    }
    const pendingCorrection = await this.prisma.correctionRequest.findFirst({
      where: {
        status: { in: [CorrectionStatus.REQUESTED, CorrectionStatus.APPROVED] },
        originalLedgerEntry: { loanId },
      },
    });
    if (pendingCorrection) {
      throw conflict("Resolve pending corrections before returning collateral");
    }
  }

  private async loadAsset(assetId: string) {
    const asset = await this.prisma.applicationAsset.findUnique({
      where: { id: assetId },
      include: {
        application: {
          select: {
            id: true,
            number: true,
            loan: { include: { schedule: { orderBy: { number: "asc" as const } } } },
          },
        },
        photos: true,
        valuations: true,
        custody: { orderBy: { createdAt: "asc" }, include: { recordedBy: { select: { name: true } } } },
      },
    });
    if (!asset) throw notFound("Asset not found");
    return asset;
  }

  private toAssetView(asset: Awaited<ReturnType<CustodyService["loadAsset"]>>): AssetView {
    const loan = asset.application.loan;
    const storedEvent = asset.custody.find((event) => event.type === CustodyEventType.STORED);
    const receivedEvent = asset.custody.find((event) => event.type === CustodyEventType.RECEIVED);
    const inspectedEvent = asset.custody.find((event) => event.type === CustodyEventType.INSPECTED);
    const valuation = asset.valuations[0];
    const canIntake =
      Boolean(loan) &&
      loan?.status === LoanStatus.APPROVED_UNFUNDED &&
      asset.status !== AssetStatus.STORED &&
      valuation?.status === ValuationStatus.COMPLETED;
    const balance =
      loan?.schedule && loan.schedule.length > 0
        ? outstanding(
            loan.schedule.map((entry) => ({
              id: entry.id,
              number: entry.number,
              amount: entry.amount,
              paidAmount: entry.paidAmount,
            })),
          )
        : "0.00";
    const canReturn =
      Boolean(loan) &&
      loan?.status === LoanStatus.SETTLED &&
      asset.status === AssetStatus.STORED &&
      balance === "0.00";
    const canSale =
      Boolean(loan) &&
      loan?.status === LoanStatus.DEFAULTED &&
      asset.status === AssetStatus.STORED;
    return {
      id: asset.id,
      applicationId: asset.application.id,
      applicationNumber: asset.application.number,
      loanId: loan?.id ?? null,
      loanNumber: loan?.number ?? null,
      name: asset.name,
      description: asset.description,
      condition: asset.condition,
      category: asset.category,
      identifier: asset.identifier,
      status: asset.status as AssetView["status"],
      version: loan?.version ?? 1,
      photoCount: asset.photos.length,
      valuationAmount: valuation?.amount ?? null,
      valuationStatus: (valuation?.status as AssetView["valuationStatus"]) ?? null,
      storageLocation: storedEvent?.location ?? null,
      receivedOn: receivedEvent?.businessDate.toISOString().slice(0, 10) ?? null,
      inspectedOn: inspectedEvent?.businessDate.toISOString().slice(0, 10) ?? null,
      inspectionResult: inspectedEvent?.inspectionResult ?? null,
      custody: asset.custody.map((event) => ({
        id: event.id,
        type: event.type as AssetView["custody"][number]["type"],
        businessDate: event.businessDate.toISOString().slice(0, 10),
        location: event.location,
        inspectionResult: event.inspectionResult,
        conditionNote: event.conditionNote,
        reason: event.reason,
        recordedBy: event.recordedBy?.name ?? null,
        createdAt: event.createdAt.toISOString(),
      })),
      saleDraft: (asset.saleDraft as Record<string, unknown> | null) ?? null,
      allowedActions: [
        {
          id: "intake",
          label: "Confirm intake",
          allowed: canIntake,
          ...(canIntake ? {} : { reason: "Intake requires a valued asset on an unfunded loan" }),
        },
        {
          id: "return",
          label: "Return to borrower",
          allowed: canReturn,
          ...(canReturn ? {} : { reason: "Return requires a settled loan, zero balance, and stored asset" }),
        },
        {
          id: "sale",
          label: "Record sale",
          allowed: canSale,
          ...(canSale ? {} : { reason: "Sale requires a defaulted loan and stored asset" }),
        },
      ],
    };
  }
}
