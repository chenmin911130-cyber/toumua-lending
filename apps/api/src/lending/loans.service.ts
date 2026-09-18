import { Inject, Injectable } from "@nestjs/common";
import {
  AssetStatus,
  CursorListQuery,
  DefaultInput,
  LedgerEntryType,
  LoanDetail,
  LoanStatus,
  LoanSummary,
  QuoteQuery,
  ScheduleEntryView,
} from "@toumua/contracts";
import { AuthUser } from "../auth/session";
import { conflict, forbidden, notFound } from "../common/http";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { assertDecideDefault, assertReadLedger } from "./access";
import {
  isQuoteFailure,
  outstanding,
  quoteRepayment,
  quoteSettlement,
} from "./calculation-policy";
import { subtract, sum } from "./money";

@Injectable()
export class LoansService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser, query: CursorListQuery) {
    assertReadLedger(user);
    const limit = query.limit ?? 20;
    const where: Record<string, unknown> = {};
    if (query.status && query.status !== "ALL") {
      where.status = query.status;
    }
    const items = await this.prisma.loan.findMany({
      where,
      take: limit + 1,
      ...(query.cursor ? { skip: 1, cursor: { id: query.cursor } } : {}),
      orderBy: { updatedAt: "desc" },
      include: {
        borrower: { select: { name: true } },
        application: { select: { number: true } },
        schedule: { orderBy: { number: "asc" } },
      },
    });
    const next = items.length > limit ? items.pop() : null;
    const total = await this.prisma.loan.count({ where });
    return {
      items: items.map((row) => this.toSummary(row)),
      nextCursor: next?.id ?? null,
      total,
    };
  }

  async get(user: AuthUser, id: string): Promise<LoanDetail> {
    assertReadLedger(user);
    const loan = await this.loadLoan(id);
    return this.toDetail(loan);
  }

  async quote(user: AuthUser, id: string, query: QuoteQuery) {
    assertReadLedger(user);
    const loan = await this.loadLoan(id);
    if ("type" in query) {
      const balanceBefore = outstanding(
        loan.schedule.map((entry) => ({
          id: entry.id,
          number: entry.number,
          amount: entry.amount,
          paidAmount: entry.paidAmount,
        })),
      );
      const saleEntries = await this.prisma.ledgerEntry.findMany({
        where: { loanId: id, type: LedgerEntryType.SALE_RECEIPT },
      });
      const saleProceeds = sum(saleEntries.map((row) => row.amount.replace(/^-/, "")));
      return { ok: true as const, quote: quoteSettlement(balanceBefore, saleProceeds) };
    }
    const entries = loan.schedule.map((entry) => ({
      id: entry.id,
      number: entry.number,
      amount: entry.amount,
      paidAmount: entry.paidAmount,
    }));
    const result = quoteRepayment(entries, query.amount);
    if (isQuoteFailure(result)) {
      return { ok: false as const, reason: result.reason };
    }
    return {
      ok: true as const,
      quote: {
        ...result,
        schedule: loan.schedule.map((entry) => this.scheduleView(entry)),
      },
    };
  }

  async declareDefault(user: AuthUser, loanId: string, input: DefaultInput) {
    assertDecideDefault(user);
    const loan = await this.loadLoan(loanId);
    if (loan.status !== LoanStatus.ACTIVE) {
      throw conflict("Only an active loan can be declared in default");
    }
    if (loan.version !== input.expectedVersion) {
      throw conflict("This loan was updated elsewhere. Reload and try again.");
    }
    // Conditional write, for the same reason as repayments and corrections: a
    // pre-read version check lets two simultaneous declarations both pass.
    const claimed = await this.prisma.loan.updateMany({
      where: { id: loanId, status: LoanStatus.ACTIVE, version: input.expectedVersion },
      data: {
        status: LoanStatus.DEFAULTED,
        defaultedAt: new Date(input.businessDate),
        defaultedById: user.id,
        defaultReason: `${input.policyBasis}: ${input.reason}`,
        version: { increment: 1 },
      },
    });
    if (claimed.count === 0) {
      throw conflict("This loan was updated elsewhere. Reload and try again.");
    }
    await this.audit.write({
      actorId: user.id,
      action: "loan.default",
      objectType: "Loan",
      objectId: loanId,
      after: { status: LoanStatus.DEFAULTED, reason: input.reason },
    });
    return this.get(user, loanId);
  }

  async disbursementReadiness(user: AuthUser, loanId: string) {
    assertReadLedger(user);
    const loan = await this.loadLoan(loanId);
    const assets = loan.application.assets;
    const stored = assets.filter((asset) => asset.status === AssetStatus.STORED);
    const items = [
      {
        id: "status",
        label: "Loan awaiting disbursement",
        complete: loan.status === LoanStatus.APPROVED_UNFUNDED,
      },
      {
        id: "assets",
        label: "All security assets stored",
        complete: assets.length > 0 && stored.length === assets.length,
        detail:
          assets.length === 0
            ? "No assets on this application"
            : `${stored.length}/${assets.length} stored`,
      },
      {
        id: "not-disbursed",
        label: "No disbursement recorded",
        complete: loan.disbursedAt === null,
      },
    ];
    return { ready: items.every((item) => item.complete), items };
  }

  async listForCustomer(userId: string) {
    const link = await this.prisma.borrowerAccountLink.findFirst({
      where: { userId, status: "ACTIVE" },
    });
    if (!link) return { items: [], nextCursor: null, total: 0 };
    const items = await this.prisma.loan.findMany({
      where: {
        borrowerId: link.borrowerId,
        status: { in: [LoanStatus.ACTIVE, LoanStatus.SETTLED, LoanStatus.DEFAULTED] },
      },
      orderBy: { updatedAt: "desc" },
      include: {
        borrower: { select: { name: true } },
        application: { select: { number: true } },
        schedule: { orderBy: { number: "asc" } },
      },
    });
    return {
      items: items.map((row) => this.toSummary(row)),
      nextCursor: null,
      total: items.length,
    };
  }

  async getForCustomer(userId: string, id: string): Promise<LoanDetail> {
    const link = await this.prisma.borrowerAccountLink.findFirst({
      where: { userId, status: "ACTIVE" },
    });
    if (!link) throw forbidden();
    const loan = await this.prisma.loan.findFirst({
      where: {
        id,
        borrowerId: link.borrowerId,
        status: { in: [LoanStatus.ACTIVE, LoanStatus.SETTLED, LoanStatus.DEFAULTED] },
      },
      include: this.loanInclude(),
    });
    if (!loan) throw notFound("Loan not found");
    return this.toDetail(loan);
  }

  private loanInclude() {
    return {
      borrower: { select: { name: true } },
      application: { select: { number: true, assets: true } },
      schedule: { orderBy: { number: "asc" as const } },
      attempts: { select: { id: true, status: true } },
    };
  }

  private async loadLoan(id: string) {
    const loan = await this.prisma.loan.findUnique({
      where: { id },
      include: this.loanInclude(),
    });
    if (!loan) throw notFound("Loan not found");
    return loan;
  }

  private toSummary(row: {
    id: string;
    number: string;
    status: string;
    borrowerId: string;
    applicationId: string;
    principal: string;
    frequency: string;
    periods: number;
    firstPaymentDate: Date;
    disbursedAt: Date | null;
    settledAt: Date | null;
    defaultedAt: Date | null;
    updatedAt: Date;
    borrower?: { name: string } | null;
    application?: { number: string } | null;
    schedule: Array<{ amount: string; paidAmount: string }>;
  }): LoanSummary {
    const balance =
      row.status === LoanStatus.APPROVED_UNFUNDED
        ? "0.00"
        : outstanding(
            row.schedule.map((entry) => ({
              id: "",
              number: 0,
              amount: entry.amount,
              paidAmount: entry.paidAmount,
            })),
          );
    return {
      id: row.id,
      number: row.number,
      status: row.status as LoanSummary["status"],
      borrowerId: row.borrowerId,
      borrowerName: row.borrower?.name ?? null,
      applicationId: row.applicationId,
      applicationNumber: row.application?.number ?? null,
      principal: row.principal,
      balance,
      frequency: row.frequency,
      periods: row.periods,
      firstPaymentDate: row.firstPaymentDate.toISOString(),
      disbursedAt: row.disbursedAt?.toISOString() ?? null,
      settledAt: row.settledAt?.toISOString() ?? null,
      defaultedAt: row.defaultedAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toDetail(
    loan: Awaited<ReturnType<LoansService["loadLoan"]>> & { defaultReason?: string | null },
  ): LoanDetail {
    const summary = this.toSummary(loan);
    const schedule = loan.schedule.map((entry) => this.scheduleView(entry));
    const overdueAmount = schedule
      .filter((entry) => entry.overdue)
      .reduce((acc, entry) => subtract(acc, `-${entry.outstanding}`), "0.00");
    const nextDue = schedule.find((entry) => entry.status === "PENDING");
    const canDisburse =
      loan.status === LoanStatus.APPROVED_UNFUNDED &&
      loan.application.assets.every((asset) => asset.status === AssetStatus.STORED) &&
      loan.application.assets.length > 0;
    const canRepay =
      loan.status === LoanStatus.ACTIVE && summary.balance !== "0.00";
    const canDefault = loan.status === LoanStatus.ACTIVE;
    const canSaleReceipt =
      loan.status === LoanStatus.DEFAULTED && summary.balance !== "0.00";
    return {
      ...summary,
      version: loan.version,
      interestMethod: loan.interestMethod,
      policy: loan.policy,
      policyConfigured: loan.policyConfigured,
      defaultReason: loan.defaultReason,
      overdueAmount,
      nextDueDate: nextDue?.dueDate ?? null,
      schedule,
      allowedActions: [
        {
          id: "disburse",
          label: "Disburse loan",
          allowed: canDisburse,
          ...(canDisburse ? {} : { reason: "Store all assets and confirm readiness first" }),
        },
        {
          id: "repay",
          label: "Record repayment",
          allowed: canRepay,
          ...(canRepay ? {} : { reason: "Repayments are only available on active loans with a balance" }),
        },
        {
          id: "default",
          label: "Declare default",
          allowed: canDefault,
          ...(canDefault ? {} : { reason: "Only an active loan can be declared in default" }),
        },
        {
          id: "sale-receipt",
          label: "Record sale proceeds",
          allowed: canSaleReceipt,
          ...(canSaleReceipt
            ? {}
            : { reason: "Sale proceeds can only be recorded on defaulted loans with a balance" }),
        },
      ],
    };
  }

  private scheduleView(entry: {
    id: string;
    number: number;
    dueDate: Date;
    amount: string;
    paidAmount: string;
    status: string;
  }): ScheduleEntryView {
    const outstandingAmount = subtract(entry.amount, entry.paidAmount);
    const overdue =
      entry.status === "PENDING" && entry.dueDate.getTime() < Date.now();
    return {
      id: entry.id,
      number: entry.number,
      dueDate: entry.dueDate.toISOString(),
      amount: entry.amount,
      paidAmount: entry.paidAmount,
      outstanding: outstandingAmount,
      status: entry.status as ScheduleEntryView["status"],
      overdue,
    };
  }
}
