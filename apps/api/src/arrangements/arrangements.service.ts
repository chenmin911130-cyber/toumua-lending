import { Inject, Injectable } from "@nestjs/common";
import { ArrangementRequestInput } from "@toumua/contracts";
import { Prisma } from "../generated/prisma";
import { AuditService } from "../audit/audit.service";
import { AuthUser } from "../auth/session";
import { conflict, notFound } from "../common/http";
import { PrismaService } from "../prisma/prisma.service";
import {
  assertActivateArrangement,
  assertCancelArrangement,
  assertManageLending,
} from "../lending/access";
import { lastFourDigits } from "./arrangement-lifecycle";

const OPEN = ["REQUESTED", "ACTIVE"] as const;

@Injectable()
export class ArrangementsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async requestForCustomer(user: AuthUser, loanId: string, input: ArrangementRequestInput) {
    const loan = await this.ownedLoan(user.id, loanId);
    return this.create(user, loan.id, input, "PORTAL");
  }

  async requestForStaff(user: AuthUser, loanId: string, input: ArrangementRequestInput) {
    assertManageLending(user);
    const loan = await this.prisma.loan.findUnique({ where: { id: loanId }, select: { id: true, status: true } });
    if (!loan) throw notFound("Loan not found");
    return this.create(user, loan.id, input, "IN_BRANCH");
  }

  async activate(user: AuthUser, id: string) {
    assertActivateArrangement(user);
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "RepaymentArrangement" WHERE "id" = ${id} FOR UPDATE`;
      const row = await tx.repaymentArrangement.findUnique({ where: { id } });
      if (!row) throw notFound("Arrangement not found");
      if (row.status !== "REQUESTED") throw conflict("Only a requested arrangement can be activated");
      const saved = await tx.repaymentArrangement.update({
        where: { id },
        data: { status: "ACTIVE", activatedById: user.id, activatedAt: new Date() },
      });
      await this.audit.write(
        {
          actorId: user.id,
          action: "arrangement.activate",
          objectType: "RepaymentArrangement",
          objectId: id,
          after: { status: "ACTIVE", loanId: saved.loanId },
        },
        tx,
      );
      return saved;
    });
    return this.summary(updated);
  }

  async cancelForCustomer(user: AuthUser, loanId: string, reason: string) {
    const loan = await this.ownedLoan(user.id, loanId);
    const row = await this.prisma.repaymentArrangement.findFirst({
      where: { loanId: loan.id, status: { in: [...OPEN] } },
    });
    if (!row) throw notFound("Arrangement not found");
    return this.cancel(user, row.id, reason);
  }

  async cancelForStaff(user: AuthUser, id: string, reason: string) {
    assertCancelArrangement(user);
    return this.cancel(user, id, reason);
  }

  async currentForLoan(loanId: string) {
    const row = await this.prisma.repaymentArrangement.findFirst({
      where: { loanId, status: { in: [...OPEN] } },
      orderBy: { createdAt: "desc" },
    });
    return row ? this.summary(row) : null;
  }

  private async create(
    user: AuthUser,
    loanId: string,
    input: ArrangementRequestInput,
    how: "PORTAL" | "IN_BRANCH",
  ) {
    const created = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Loan" WHERE "id" = ${loanId} FOR UPDATE`;
      const loan = await tx.loan.findUnique({ where: { id: loanId }, select: { id: true, status: true } });
      if (!loan) throw notFound("Loan not found");
      if (loan.status !== "ACTIVE" && loan.status !== "APPROVED_UNFUNDED") {
        throw conflict("Automatic repayments can only be arranged on an open loan");
      }
      const open = await tx.repaymentArrangement.findFirst({
        where: { loanId, status: { in: [...OPEN] } },
        select: { id: true },
      });
      if (open) throw conflict("This loan already has an automatic repayment arrangement");
      const now = new Date();
      try {
        const row = await tx.repaymentArrangement.create({
          data: {
            loanId,
            method: input.method,
            accountName: input.accountName.trim(),
            accountNumberLast4: lastFourDigits(input.accountNumber),
            bankName: input.bankName?.trim() || null,
            requestedById: user.id,
            consentedById: user.id,
            consentedAt: now,
            consentHow: how,
          },
        });
        await this.audit.write(
          {
            actorId: user.id,
            action: "arrangement.request",
            objectType: "RepaymentArrangement",
            objectId: row.id,
            after: {
              loanId,
              method: input.method,
              accountNumberLast4: row.accountNumberLast4,
              consent: { userId: user.id, at: now.toISOString(), how },
            },
          },
          tx,
        );
        return row;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          throw conflict("This loan already has an automatic repayment arrangement");
        }
        throw error;
      }
    });
    return this.summary(created);
  }

  private async cancel(user: AuthUser, id: string, reason: string) {
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "RepaymentArrangement" WHERE "id" = ${id} FOR UPDATE`;
      const row = await tx.repaymentArrangement.findUnique({ where: { id } });
      if (!row || row.status === "CANCELLED") throw notFound("Arrangement not found");
      const saved = await tx.repaymentArrangement.update({
        where: { id },
        data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason },
      });
      await this.audit.write(
        {
          actorId: user.id,
          action: "arrangement.cancel",
          objectType: "RepaymentArrangement",
          objectId: id,
          reason,
          after: { status: "CANCELLED", loanId: saved.loanId },
        },
        tx,
      );
      return saved;
    });
    return this.summary(updated);
  }

  private async ownedLoan(userId: string, loanId: string) {
    const link = await this.prisma.borrowerAccountLink.findFirst({
      where: { userId, status: "ACTIVE" },
      select: { borrowerId: true },
    });
    if (!link) throw notFound("Loan not found");
    const loan = await this.prisma.loan.findFirst({
      where: { id: loanId, borrowerId: link.borrowerId },
      select: { id: true, status: true },
    });
    if (!loan) throw notFound("Loan not found");
    return loan;
  }

  summary(row: {
    id: string;
    loanId: string;
    method: string;
    status: string;
    accountName: string;
    accountNumberLast4: string;
    bankName: string | null;
    activatedAt: Date | null;
    cancelledAt: Date | null;
    cancelReason: string | null;
  }) {
    return {
      id: row.id,
      loanId: row.loanId,
      method: row.method as "BANK_AUTOMATIC_PAYMENT" | "DIRECT_DEBIT",
      status: row.status as "REQUESTED" | "ACTIVE" | "CANCELLED",
      accountName: row.accountName,
      accountNumberLast4: row.accountNumberLast4,
      bankName: row.bankName,
      activatedAt: row.activatedAt?.toISOString() ?? null,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
      cancelReason: row.cancelReason,
    };
  }
}
