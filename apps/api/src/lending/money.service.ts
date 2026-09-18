import { Inject, Injectable } from "@nestjs/common";
import {
  DisbursementInput,
  LedgerEntryType,
  LoanStatus,
  PaymentAttemptStatus,
  RepaymentInput,
  SaleReceiptInput,
} from "@toumua/contracts";
import { AuthUser } from "../auth/session";
import { conflict, notFound, validation } from "../common/http";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { assertPostMoney, assertReadLedger } from "./access";
import { assertNoOpenAttempts } from "./decisions.service";
import {
  isQuoteFailure,
  outstanding,
  quoteRepayment,
} from "./calculation-policy";
import { beginAttempt, describeAttempt, inspectIdempotencyKey } from "./idempotency";
import { compare, min, subtract } from "./money";
import { NumbersService } from "./numbers.service";
import { LoansService } from "./loans.service";

@Injectable()
export class MoneyService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(NumbersService) private readonly numbers: NumbersService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(LoansService) private readonly loans: LoansService,
  ) {}

  async disburse(
    user: AuthUser,
    loanId: string,
    input: DisbursementInput,
    idempotencyKey: string,
  ) {
    assertPostMoney(user);
    if (!idempotencyKey.trim()) {
      throw validation("Idempotency-Key header is required");
    }
    const body = { ...input };
    const existingAttempt = await this.prisma.paymentAttempt.findUnique({
      where: { idempotencyKey },
    });
    const inspection = inspectIdempotencyKey(existingAttempt, body);
    if (inspection.action === "replay") {
      return this.replayMoneyResult(inspection.attemptId, user.id);
    }

    const readiness = await this.loans.disbursementReadiness(user, loanId);
    if (!readiness.ready) {
      throw validation("This loan is not ready for disbursement");
    }
    const loan = await this.prisma.loan.findUnique({
      where: { id: loanId },
      include: { attempts: { select: { status: true } } },
    });
    if (!loan) throw notFound("Loan not found");
    if (loan.version !== input.expectedVersion) {
      throw conflict("This loan was updated elsewhere. Reload and try again.");
    }
    assertNoOpenAttempts(loan.attempts);

    const businessDate = new Date(input.businessDate);

    const result = await this.prisma.$transaction(async (tx) => {
      const start = await beginAttempt(tx, {
        idempotencyKey,
        type: "DISBURSEMENT",
        loanId,
        initiatedById: user.id,
        body,
      });

      const locked = await tx.loan.updateMany({
        where: {
          id: loanId,
          version: input.expectedVersion,
          status: LoanStatus.APPROVED_UNFUNDED,
          disbursedAt: null,
        },
        data: {
          status: LoanStatus.ACTIVE,
          disbursedAt: new Date(),
          disbursedById: user.id,
          disbursementKey: idempotencyKey,
          version: { increment: 1 },
        },
      });
      if (locked.count === 0) {
        throw conflict("This loan was already disbursed or updated elsewhere.");
      }

      const ledger = await tx.ledgerEntry.create({
        data: {
          loanId,
          type: LedgerEntryType.DISBURSEMENT,
          amount: loan.principal,
          businessDate,
          method: input.method,
          externalReference: input.externalReference ?? null,
          note: input.note ?? null,
          postedById: user.id,
          attemptId: start.attemptId,
        },
      });

      const receiptNumber = await this.numbers.nextReceiptNumber(tx);
      const balanceAfter = loan.principal;
      const receipt = await tx.receipt.create({
        data: {
          number: receiptNumber,
          loanId,
          ledgerEntryId: ledger.id,
          issuedById: user.id,
          summary: {
            type: "DISBURSEMENT",
            amount: loan.principal,
            businessDate: input.businessDate,
            method: input.method,
            balanceAfter,
          },
        },
      });

      await tx.paymentAttempt.update({
        where: { id: start.attemptId },
        data: {
          status: PaymentAttemptStatus.COMMITTED,
          ledgerEntryId: ledger.id,
          committedAt: new Date(),
        },
      });

      await this.audit.write(
        {
          actorId: user.id,
          action: "loan.disburse",
          objectType: "Loan",
          objectId: loanId,
          after: { ledgerEntryId: ledger.id, receiptId: receipt.id },
        },
        tx,
      );

      return {
        replay: false as const,
        receiptId: receipt.id,
        receiptNumber: receipt.number,
        ledgerEntryId: ledger.id,
        attemptId: start.attemptId,
      };
    });

    return result;
  }

  async repay(
    user: AuthUser,
    loanId: string,
    input: RepaymentInput,
    idempotencyKey: string,
  ) {
    assertPostMoney(user);
    if (!idempotencyKey.trim()) {
      throw validation("Idempotency-Key header is required");
    }
    const body = { ...input };
    const existingAttempt = await this.prisma.paymentAttempt.findUnique({
      where: { idempotencyKey },
    });
    const inspection = inspectIdempotencyKey(existingAttempt, body);
    if (inspection.action === "replay") {
      return this.replayMoneyResult(inspection.attemptId, user.id);
    }

    const loan = await this.prisma.loan.findUnique({
      where: { id: loanId },
      include: {
        schedule: { orderBy: { number: "asc" } },
        attempts: { select: { status: true } },
      },
    });
    if (!loan) throw notFound("Loan not found");
    if (loan.status !== LoanStatus.ACTIVE) {
      throw conflict("Repayments can only be recorded on active loans");
    }
    if (loan.version !== input.expectedVersion) {
      throw conflict("This loan was updated elsewhere. Reload and try again.");
    }
    assertNoOpenAttempts(loan.attempts);

    const businessDate = new Date(input.businessDate);

    const result = await this.prisma.$transaction(async (tx) => {
      const start = await beginAttempt(tx, {
        idempotencyKey,
        type: "REPAYMENT",
        loanId,
        initiatedById: user.id,
        body,
      });

      // Claim this exact version inside the transaction. Checking the version
      // before the transaction let two concurrent repayments both read the same
      // schedule and both apply against the old paid amounts, so one payment
      // reached the ledger without ever reducing the balance.
      const claimed = await tx.loan.updateMany({
        where: {
          id: loanId,
          version: input.expectedVersion,
          status: LoanStatus.ACTIVE,
        },
        data: { version: { increment: 1 } },
      });
      if (claimed.count === 0) {
        throw conflict("This loan was updated elsewhere. Reload and try again.");
      }

      // Re-read the plan under the claim so allocations use committed amounts.
      const fresh = await tx.scheduleEntry.findMany({
        where: { loanId },
        orderBy: { number: "asc" },
      });
      const quote = quoteRepayment(
        fresh.map((entry) => ({
          id: entry.id,
          number: entry.number,
          amount: entry.amount,
          paidAmount: entry.paidAmount,
        })),
        input.amount,
      );
      if (isQuoteFailure(quote)) {
        throw validation(quote.reason);
      }

      for (const allocation of quote.allocations) {
        const entry = fresh.find((row) => row.id === allocation.entryId);
        await tx.scheduleEntry.update({
          where: { id: allocation.entryId },
          data: {
            paidAmount: allocation.paidAmountAfter,
            status:
              entry && compare(allocation.paidAmountAfter, entry.amount) >= 0
                ? "PAID"
                : "PENDING",
          },
        });
      }

      const ledger = await tx.ledgerEntry.create({
        data: {
          loanId,
          type: LedgerEntryType.REPAYMENT,
          amount: `-${input.amount}`,
          businessDate,
          method: input.method,
          externalReference: input.externalReference ?? null,
          note: input.note ?? null,
          postedById: user.id,
          attemptId: start.attemptId,
        },
      });

      const receiptNumber = await this.numbers.nextReceiptNumber(tx);
      const balanceAfter = quote.balanceAfter;
      const receipt = await tx.receipt.create({
        data: {
          number: receiptNumber,
          loanId,
          ledgerEntryId: ledger.id,
          issuedById: user.id,
          summary: {
            type: "REPAYMENT",
            amount: input.amount,
            businessDate: input.businessDate,
            method: input.method,
            balanceAfter,
            allocations: quote.allocations,
          },
        },
      });

      // The version was already incremented by the claim above; only the
      // settlement transition is left to record here.
      if (quote.settled) {
        await tx.loan.update({
          where: { id: loanId },
          data: { status: LoanStatus.SETTLED, settledAt: new Date() },
        });
      }

      await tx.paymentAttempt.update({
        where: { id: start.attemptId },
        data: {
          status: PaymentAttemptStatus.COMMITTED,
          ledgerEntryId: ledger.id,
          committedAt: new Date(),
        },
      });

      await this.audit.write(
        {
          actorId: user.id,
          action: "loan.repay",
          objectType: "Loan",
          objectId: loanId,
          after: { ledgerEntryId: ledger.id, receiptId: receipt.id, settled: quote.settled },
        },
        tx,
      );

      return {
        replay: false as const,
        receiptId: receipt.id,
        receiptNumber: receipt.number,
        ledgerEntryId: ledger.id,
        attemptId: start.attemptId,
        settled: quote.settled,
        balanceAfter,
      };
    });

    return result;
  }

  async saleReceipt(
    user: AuthUser,
    loanId: string,
    input: SaleReceiptInput,
    idempotencyKey: string,
  ) {
    assertPostMoney(user);
    if (!idempotencyKey.trim()) {
      throw validation("Idempotency-Key header is required");
    }
    const body = { ...input };
    const existingAttempt = await this.prisma.paymentAttempt.findUnique({
      where: { idempotencyKey },
    });
    const inspection = inspectIdempotencyKey(existingAttempt, body);
    if (inspection.action === "replay") {
      return this.replayMoneyResult(inspection.attemptId, user.id);
    }

    const loan = await this.prisma.loan.findUnique({
      where: { id: loanId },
      include: {
        schedule: { orderBy: { number: "asc" } },
        attempts: { select: { status: true } },
      },
    });
    if (!loan) throw notFound("Loan not found");
    if (loan.status !== LoanStatus.DEFAULTED) {
      throw conflict("Sale proceeds can only be recorded on defaulted loans");
    }
    if (loan.version !== input.expectedVersion) {
      throw conflict("This loan was updated elsewhere. Reload and try again.");
    }
    assertNoOpenAttempts(loan.attempts);

    const businessDate = new Date(input.businessDate);
    const result = await this.prisma.$transaction(async (tx) => {
      const start = await beginAttempt(tx, {
        idempotencyKey,
        type: "SALE_RECEIPT",
        loanId,
        initiatedById: user.id,
        body,
      });
      const claimed = await tx.loan.updateMany({
        where: {
          id: loanId,
          version: input.expectedVersion,
          status: LoanStatus.DEFAULTED,
        },
        data: { version: { increment: 1 } },
      });
      if (claimed.count === 0) {
        throw conflict("This loan was updated elsewhere. Reload and try again.");
      }
      const fresh = await tx.scheduleEntry.findMany({
        where: { loanId },
        orderBy: { number: "asc" },
      });
      // Sale proceeds may legitimately exceed the debt: selling the security can
      // recover more than the balance, and the surplus awaits the official
      // settlement policy. Charge the plan only up to what is owed and keep the
      // remainder visible as surplus rather than refusing the real sale amount.
      const outstandingBefore = outstanding(
        fresh.map((entry) => ({
          id: entry.id,
          number: entry.number,
          amount: entry.amount,
          paidAmount: entry.paidAmount,
        })),
      );
      const chargeable = min(input.amount, outstandingBefore);
      const surplus = subtract(input.amount, chargeable);
      const quote = quoteRepayment(
        fresh.map((entry) => ({
          id: entry.id,
          number: entry.number,
          amount: entry.amount,
          paidAmount: entry.paidAmount,
        })),
        chargeable,
      );
      if (isQuoteFailure(quote)) {
        throw validation(quote.reason);
      }
      for (const allocation of quote.allocations) {
        const entry = fresh.find((row) => row.id === allocation.entryId);
        await tx.scheduleEntry.update({
          where: { id: allocation.entryId },
          data: {
            paidAmount: allocation.paidAmountAfter,
            status:
              entry && compare(allocation.paidAmountAfter, entry.amount) >= 0
                ? "PAID"
                : "PENDING",
          },
        });
      }
      const ledger = await tx.ledgerEntry.create({
        data: {
          loanId,
          type: LedgerEntryType.SALE_RECEIPT,
          amount: `-${input.amount}`,
          businessDate,
          method: input.method,
          externalReference: input.externalReference ?? null,
          note: input.note ?? null,
          postedById: user.id,
          attemptId: start.attemptId,
        },
      });
      const receiptNumber = await this.numbers.nextReceiptNumber(tx);
      const balanceAfter = quote.balanceAfter;
      const receipt = await tx.receipt.create({
        data: {
          number: receiptNumber,
          loanId,
          ledgerEntryId: ledger.id,
          issuedById: user.id,
          summary: {
            type: "SALE_RECEIPT",
            amount: input.amount,
            businessDate: input.businessDate,
            method: input.method,
            balanceAfter,
            surplus,
            allocations: quote.allocations,
          },
        },
      });
      await tx.paymentAttempt.update({
        where: { id: start.attemptId },
        data: {
          status: PaymentAttemptStatus.COMMITTED,
          ledgerEntryId: ledger.id,
          committedAt: new Date(),
        },
      });
      // Recovering the whole debt through the sale is the end of the default:
      // without this the loan stays DEFAULTED at a zero balance and the
      // collateral can never be returned.
      if (quote.settled) {
        await tx.loan.update({
          where: { id: loanId },
          data: { status: LoanStatus.SETTLED, settledAt: new Date() },
        });
      }
      await this.audit.write(
        {
          actorId: user.id,
          action: "loan.sale_receipt",
          objectType: "Loan",
          objectId: loanId,
          after: { ledgerEntryId: ledger.id, receiptId: receipt.id },
        },
        tx,
      );
      return {
        receiptId: receipt.id,
        receiptNumber: receipt.number,
        ledgerEntryId: ledger.id,
        attemptId: start.attemptId,
        balanceAfter,
        surplus,
        settled: quote.settled,
      };
    });
    return result;
  }

  async listUnresolvedAttempts(user: AuthUser, mineOnly: boolean) {
    assertReadLedger(user);
    const items = await this.prisma.paymentAttempt.findMany({
      where: {
        status: { in: [PaymentAttemptStatus.PENDING, PaymentAttemptStatus.UNKNOWN] },
        ...(mineOnly ? { initiatedById: user.id } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return {
      items: await Promise.all(
        items.map(async (row) => {
          const view = await describeAttempt(this.prisma, row.id, user.id, !mineOnly);
          return view!;
        }),
      ),
    };
  }

  /** Return the same receipt fields a fresh post would have sent back. */
  private async replayMoneyResult(attemptId: string, userId: string) {
    const attempt = await describeAttempt(this.prisma, attemptId, userId, false);
    if (!attempt?.receiptId) {
      throw conflict("This attempt has no posted receipt to replay");
    }
    const receipt = await this.prisma.receipt.findUnique({
      where: { id: attempt.receiptId },
    });
    if (!receipt) {
      throw conflict("This attempt has no posted receipt to replay");
    }
    const summary = receipt.summary as Record<string, unknown>;
    return {
      receiptId: receipt.id,
      receiptNumber: receipt.number,
      ledgerEntryId: attempt.ledgerEntryId,
      attemptId: attempt.id,
      balanceAfter: typeof summary.balanceAfter === "string" ? summary.balanceAfter : undefined,
    };
  }

  async listTransactions(user: AuthUser, query: { cursor?: string; limit?: number }) {
    assertReadLedger(user);
    // A non-numeric ?limit= parses to NaN, which would reach Prisma as take:
    // NaN and surface as an unhandled 500 rather than a validation error.
    const requested = Number.isFinite(query.limit) ? Math.trunc(query.limit as number) : 20;
    const limit = Math.min(Math.max(requested, 1), 100);
    const items = await this.prisma.ledgerEntry.findMany({
      take: limit + 1,
      ...(query.cursor ? { skip: 1, cursor: { id: query.cursor } } : {}),
      orderBy: { createdAt: "desc" },
      include: {
        loan: { select: { number: true, borrower: { select: { name: true } } } },
        postedBy: { select: { name: true } },
        receipt: { select: { id: true, number: true } },
      },
    });
    const next = items.length > limit ? items.pop() : null;
    const total = await this.prisma.ledgerEntry.count();
    return {
      items: items.map((row) => ({
        id: row.id,
        loanId: row.loanId,
        loanNumber: row.loan.number,
        borrowerName: row.loan.borrower?.name ?? null,
        type: row.type,
        amount: row.amount,
        businessDate: row.businessDate.toISOString().slice(0, 10),
        method: row.method,
        externalReference: row.externalReference,
        note: row.note,
        postedBy: row.postedBy?.name ?? null,
        createdAt: row.createdAt.toISOString(),
        receiptId: row.receipt?.id ?? null,
        receiptNumber: row.receipt?.number ?? null,
      })),
      nextCursor: next?.id ?? null,
      total,
    };
  }

  async getTransaction(user: AuthUser, id: string) {
    assertReadLedger(user);
    const row = await this.prisma.ledgerEntry.findUnique({
      where: { id },
      include: {
        loan: { select: { number: true, borrower: { select: { name: true } } } },
        postedBy: { select: { name: true } },
        receipt: true,
      },
    });
    if (!row) throw notFound("Transaction not found");
    return {
      id: row.id,
      loanId: row.loanId,
      loanNumber: row.loan.number,
      borrowerName: row.loan.borrower?.name ?? null,
      type: row.type,
      amount: row.amount,
      businessDate: row.businessDate.toISOString().slice(0, 10),
      method: row.method,
      externalReference: row.externalReference,
      note: row.note,
      postedBy: row.postedBy?.name ?? null,
      createdAt: row.createdAt.toISOString(),
      receipt: row.receipt
        ? {
            id: row.receipt.id,
            number: row.receipt.number,
            summary: row.receipt.summary,
          }
        : null,
    };
  }

  async getReceipt(user: AuthUser, id: string) {
    assertReadLedger(user);
    return this.loadReceipt(id);
  }

  async getReceiptForCustomer(userId: string, id: string) {
    const receipt = await this.prisma.receipt.findUnique({
      where: { id },
      include: {
        loan: { include: { borrower: { include: { accountLinks: { where: { status: "ACTIVE" } } } } } },
      },
    });
    if (!receipt) throw notFound("Receipt not found");
    const linked = receipt.loan.borrower.accountLinks.some((link) => link.userId === userId);
    if (!linked) throw notFound("Receipt not found");
    return this.loadReceipt(id);
  }

  private async loadReceipt(id: string) {
    const receipt = await this.prisma.receipt.findUnique({
      where: { id },
      include: {
        loan: { select: { number: true } },
        issuedBy: { select: { name: true } },
      },
    });
    if (!receipt) throw notFound("Receipt not found");
    return {
      id: receipt.id,
      number: receipt.number,
      loanId: receipt.loanId,
      loanNumber: receipt.loan.number,
      issuedBy: receipt.issuedBy?.name ?? null,
      createdAt: receipt.createdAt.toISOString(),
      summary: receipt.summary as Record<string, unknown>,
    };
  }

  async getPaymentAttempt(user: AuthUser, id: string) {
    assertReadLedger(user);
    const attempt = await describeAttempt(this.prisma, id, user.id, true);
    if (!attempt) throw notFound("Payment attempt not found");
    return attempt;
  }
}
