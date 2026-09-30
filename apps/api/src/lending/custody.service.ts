import { Inject, Injectable } from "@nestjs/common";
import {
  AssetHistoryEntry,
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
import { countOccupied } from "./storage-occupancy";

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
              {
                application: {
                  borrower: { name: { contains: q, mode: "insensitive" as const } },
                },
              },
              {
                application: {
                  borrower: { number: { contains: q, mode: "insensitive" as const } },
                },
              },
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
      include: assetGraph,
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
        const placement = await this.resolvePlacement(tx, input);
        await tx.custodyEvent.create({
          data: {
            assetId,
            loanId: loan.id,
            type: CustodyEventType.STORED,
            businessDate: inspectedOn,
            location: placement.location,
            storageLocationId: placement.storageLocationId,
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
    const previous = latestPlacement(asset.custody);
    const previousCode = previous?.storageLocation?.code ?? previous?.location ?? null;

    await this.prisma.$transaction(async (tx) => {
      const placement = await this.resolvePlacement(tx, input, assetId);
      await tx.custodyEvent.create({
        data: {
          assetId,
          loanId: loan.id,
          type: CustodyEventType.RELOCATED,
          businessDate: new Date(),
          location: placement.location,
          storageLocationId: placement.storageLocationId,
          conditionNote: input.conditionNote ?? null,
          reason: input.reason,
          recordedById: user.id,
        },
      });
      await tx.loan.update({ where: { id: loan.id }, data: { version: { increment: 1 } } });
      await this.audit.write(
        {
          actorId: user.id,
          action: "asset.relocate",
          objectType: "ApplicationAsset",
          objectId: assetId,
          before: { location: previousCode },
          after: { location: placement.location },
          reason: input.reason,
        },
        tx,
      );
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

  async history(user: AuthUser, assetId: string): Promise<AssetHistoryEntry[]> {
    assertReadLedger(user);
    const asset = await this.loadAsset(assetId);
    const valuationIds = asset.valuations.map((row) => row.id);
    const audits = await this.prisma.auditEvent.findMany({
      where: {
        OR: [
          { objectType: "ApplicationAsset", objectId: assetId },
          ...(valuationIds.length
            ? [{ objectType: "Valuation", objectId: { in: valuationIds } }]
            : []),
        ],
      },
      include: { actor: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });
    const entries: AssetHistoryEntry[] = [
      ...custodyHistory(asset.custody),
      ...audits.map((event) => ({
        at: event.createdAt.toISOString(),
        actor: event.actor?.name ?? null,
        kind: "audit" as const,
        action: event.action,
        summary: summarizeAudit(event),
        before: event.before ?? null,
        after: event.after ?? null,
      })),
    ];
    entries.sort((left, right) => (left.at < right.at ? 1 : left.at > right.at ? -1 : 0));
    return entries;
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
      include: assetGraph,
    });
    if (!asset) throw notFound("Asset not found");
    return asset;
  }

  private async resolvePlacement(
    tx: Prisma.TransactionClient,
    input: { storageLocationId?: string | null; location?: string | null },
    excludeAssetId?: string,
  ) {
    const storageLocationId = input.storageLocationId?.trim() || null;
    if (!storageLocationId) {
      return { storageLocationId: null, location: input.location?.trim() || null };
    }
    const location = await tx.storageLocation.findUnique({ where: { id: storageLocationId } });
    if (!location || !location.active) {
      throw validation("This storage location is not available");
    }
    if (location.capacity != null) {
      const occupied = await countOccupied(tx, location.id, excludeAssetId);
      if (occupied >= location.capacity) {
        throw conflict("This location is full");
      }
    }
    return { storageLocationId: location.id, location: location.code };
  }

  private toAssetView(asset: Awaited<ReturnType<CustodyService["loadAsset"]>>): AssetView {
    const loan = asset.application.loan;
    const placed = latestPlacement(asset.custody);
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
      borrower: asset.application.borrower
        ? {
            id: asset.application.borrower.id,
            number: asset.application.borrower.number,
            name: asset.application.borrower.name,
          }
        : null,
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
      storageLocation: placed?.storageLocation
        ? {
            id: placed.storageLocation.id,
            code: placed.storageLocation.code,
            name: placed.storageLocation.name,
            kind: placed.storageLocation.kind,
            secure: placed.storageLocation.secure,
          }
        : null,
      storageLocationLabel: placed?.location ?? null,
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

const assetGraph = {
  application: {
    select: {
      id: true,
      number: true,
      borrower: { select: { id: true, number: true, name: true } },
      loan: { include: { schedule: { orderBy: { number: "asc" as const } } } },
    },
  },
  photos: true,
  valuations: true,
  custody: {
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
    include: {
      recordedBy: { select: { name: true } },
      storageLocation: {
        select: { id: true, code: true, name: true, kind: true, secure: true },
      },
    },
  },
};

function latestPlacement<T extends { type: string }>(events: T[]) {
  const placements = events.filter(
    (event) => event.type === CustodyEventType.STORED || event.type === CustodyEventType.RELOCATED,
  );
  return placements.at(-1);
}

function custodyHistory(
  events: Array<{
    type: string;
    createdAt: Date;
    location: string | null;
    inspectionResult: string | null;
    conditionNote: string | null;
    reason: string | null;
    recordedBy: { name: string } | null;
    storageLocation: { code: string } | null;
  }>,
): AssetHistoryEntry[] {
  const entries: AssetHistoryEntry[] = [];
  let previousLocation: string | null = null;
  for (const event of events) {
    const locationCode = event.storageLocation?.code ?? event.location;
    const summary = summarizeCustody(event, previousLocation);
    const isPlacement =
      event.type === CustodyEventType.STORED || event.type === CustodyEventType.RELOCATED;
    entries.push({
      at: event.createdAt.toISOString(),
      actor: event.recordedBy?.name ?? null,
      kind: "custody",
      action: event.type,
      summary,
      before: event.type === CustodyEventType.RELOCATED ? { location: previousLocation } : null,
      after: isPlacement ? { location: locationCode } : event.inspectionResult
        ? { inspectionResult: event.inspectionResult }
        : null,
    });
    if (isPlacement) previousLocation = locationCode;
  }
  return entries;
}

function summarizeCustody(
  event: {
    type: string;
    location: string | null;
    inspectionResult: string | null;
    conditionNote: string | null;
    reason: string | null;
    storageLocation: { code: string } | null;
  },
  from: string | null,
) {
  const code = event.storageLocation?.code ?? event.location;
  switch (event.type) {
    case CustodyEventType.RECEIVED:
      return "Received into custody";
    case CustodyEventType.INSPECTED:
      if (event.inspectionResult === "FAIL") {
        return event.conditionNote?.trim()
          ? `Inspection failed — ${event.conditionNote.trim()}`
          : "Inspection failed";
      }
      return "Inspection passed";
    case CustodyEventType.STORED:
      return `Stored at ${code ?? "an unnamed location"}`;
    case CustodyEventType.RELOCATED: {
      const moved = `Moved from ${from ?? "the previous location"} to ${code ?? "a new location"}`;
      return event.reason?.trim() ? `${moved} — reason: ${event.reason.trim()}` : moved;
    }
    case CustodyEventType.RETURNED:
      return "Returned to the borrower";
    case CustodyEventType.SOLD:
      return "Recorded sale of the asset";
    default:
      return event.type;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function displayValue(value: unknown) {
  if (value == null || value === "") return "blank";
  return String(value);
}

function summarizeAudit(event: {
  action: string;
  before: unknown;
  after: unknown;
  reason: string | null;
}) {
  const before = asRecord(event.before);
  const after = asRecord(event.after);
  switch (event.action) {
    case "asset.update": {
      const fields = Object.keys(after ?? {});
      if (fields.length === 1) {
        const field = fields[0] ?? "";
        return `Updated ${field} from ${displayValue(before?.[field])} to ${displayValue(after?.[field])}`;
      }
      return fields.length > 0 ? `Updated ${fields.join(", ")}` : "Updated the asset";
    }
    case "asset.create":
      return after?.name ? `Added asset ${displayValue(after.name)}` : "Added an asset";
    case "asset.delete":
      return before?.name ? `Removed asset ${displayValue(before.name)}` : "Removed an asset";
    case "asset.intake":
      return after?.inspectionResult === "FAIL"
        ? "Recorded a failed intake inspection"
        : "Recorded intake";
    case "asset.relocate": {
      const moved =
        before?.location != null && after?.location != null
          ? `Moved from ${displayValue(before.location)} to ${displayValue(after.location)}`
          : "Relocated the asset";
      return event.reason?.trim() ? `${moved} — reason: ${event.reason.trim()}` : moved;
    }
    case "asset.return":
      return "Recorded return of the asset";
    case "asset.sale":
      return "Recorded sale of the asset";
    case "valuation.complete":
    case "asset.valuation":
      if (after?.amount != null && after.basis != null) {
        return `Completed valuation at ${displayValue(after.amount)} — ${displayValue(after.basis)}`;
      }
      if (after?.amount != null) return `Completed valuation at ${displayValue(after.amount)}`;
      return "Completed valuation";
    default:
      return event.action.replaceAll(".", " ");
  }
}
