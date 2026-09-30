import { Inject, Injectable } from "@nestjs/common";
import {
  AssetStatus,
  CorrectionDecisionInput,
  CorrectionRequestInput,
  CorrectionStatus,
  CorrectionView,
  CursorListQuery,
  LedgerEntryType,
  LoanStatus,
} from "@toumua/contracts";
import { AuthUser } from "../auth/session";
import { conflict, notFound, validation } from "../common/http";
import { AuditService } from "../audit/audit.service";
import { Prisma } from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import { assertApproveCorrection, assertReadLedger, assertRequestCorrection } from "./access";
import { compare, fromCents, isPositive, toCents } from "./money";

function assertDisbursementAmountUnchanged(
  original: { type: string; amount: string },
  proposed: Record<string, unknown>,
) {
  if (original.type !== "DISBURSEMENT") return;
  if (typeof proposed.amount !== "string") return;
  if (compare(proposed.amount, original.amount.replace(/^-/, "")) !== 0) {
    throw validation(
      "Disbursement amounts cannot be corrected. Reverse and re-disburse with manager approval.",
    );
  }
}

@Injectable()
export class CorrectionsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser, query: CursorListQuery) {
    assertReadLedger(user);
    const limit = query.limit ?? 20;
    const where =
      query.status && query.status !== "ALL"
        ? { status: query.status as CorrectionStatus }
        : {};
    const items = await this.prisma.correctionRequest.findMany({
      where,
      take: limit + 1,
      ...(query.cursor ? { skip: 1, cursor: { id: query.cursor } } : {}),
      orderBy: { createdAt: "desc" },
      include: this.include(),
    });
    const next = items.length > limit ? items.pop() : null;
    const total = await this.prisma.correctionRequest.count({ where });
    return {
      items: await Promise.all(items.map((row) => this.toView(row, user))),
      nextCursor: next?.id ?? null,
      total,
    };
  }

  async get(user: AuthUser, id: string) {
    assertReadLedger(user);
    const row = await this.prisma.correctionRequest.findUnique({
      where: { id },
      include: this.include(),
    });
    if (!row) throw notFound("Correction not found");
    return this.toView(row, user);
  }

  async create(user: AuthUser, input: CorrectionRequestInput) {
    assertRequestCorrection(user);
    const original = await this.prisma.ledgerEntry.findUnique({
      where: { id: input.originalLedgerEntryId },
      include: {
        loan: { include: { application: { include: { assets: true } } } },
        correctionRequests: {
          where: { status: { in: [CorrectionStatus.REQUESTED, CorrectionStatus.APPROVED] } },
        },
      },
    });
    if (!original) throw notFound("Original transaction not found");
    // Refuse unsupported or already-corrected originals before any state is
    // touched. A second correction against the same entry would apply its
    // replacement delta on top of the first.
    await this.assertOriginalCorrectable(
      this.prisma,
      original,
      null,
      input.proposedValues as Record<string, unknown>,
    );
    if (original.correctionRequests.length > 0) {
      throw conflict("This transaction already has a pending correction");
    }
    const disposed = original.loan.application.assets.some(
      (asset) => asset.status === AssetStatus.RETURNED || asset.status === AssetStatus.SOLD,
    );
    if (disposed) {
      throw conflict("Corrections are blocked after collateral has been returned or sold");
    }
    // Posting only knows how to replace an amount with another amount, so reject
    // a nonsensical replacement here rather than failing at post time.
    const proposedAmount = (input.proposedValues as Record<string, unknown>).amount;
    if (proposedAmount !== undefined && !isPositive(String(proposedAmount))) {
      throw validation("The corrected amount must be greater than zero", {
        amount: ["Enter an amount greater than zero"],
      });
    }
    assertDisbursementAmountUnchanged(original, input.proposedValues as Record<string, unknown>);
    const row = await this.prisma.correctionRequest.create({
      data: {
        originalLedgerEntryId: original.id,
        proposedValues: input.proposedValues,
        reason: input.reason,
        requestedById: user.id,
      },
      include: this.include(),
    });
    await this.audit.write({
      actorId: user.id,
      action: "correction.request",
      objectType: "CorrectionRequest",
      objectId: row.id,
      after: { originalLedgerEntryId: original.id },
    });
    return this.toView(row, user);
  }

  async decide(user: AuthUser, id: string, input: CorrectionDecisionInput) {
    assertApproveCorrection(user);
    const row = await this.prisma.correctionRequest.findUnique({
      where: { id },
      include: this.include(),
    });
    if (!row) throw notFound("Correction not found");
    if (row.status !== CorrectionStatus.REQUESTED) {
      throw conflict("Only a requested correction can be decided");
    }
    if (row.version !== input.expectedVersion) {
      throw conflict("This correction was updated elsewhere. Reload and try again.");
    }
    if (input.decision === "approve") {
      assertDisbursementAmountUnchanged(
        row.originalLedgerEntry,
        row.proposedValues as Record<string, unknown>,
      );
    }
    // Claim the decision with a conditional write. A pre-read check is not
    // enough: two simultaneous decisions both read REQUESTED and both write, so
    // approval and rejection could both "succeed" and the last writer won.
    const claimed = await this.prisma.correctionRequest.updateMany({
      where: { id, status: CorrectionStatus.REQUESTED, version: input.expectedVersion },
      data: {
        status: input.decision === "approve" ? CorrectionStatus.APPROVED : CorrectionStatus.REJECTED,
        decidedById: user.id,
        decisionReason: input.reason ?? null,
        version: { increment: 1 },
      },
    });
    if (claimed.count === 0) {
      throw conflict("This correction was already decided. Reload to see the outcome.");
    }
    const updated = await this.prisma.correctionRequest.findUniqueOrThrow({
      where: { id },
      include: this.include(),
    });
    await this.audit.write({
      actorId: user.id,
      action: input.decision === "approve" ? "correction.approve" : "correction.reject",
      objectType: "CorrectionRequest",
      objectId: id,
      after: { status: updated.status },
      reason: input.reason ?? null,
    });
    return this.toView(updated, user);
  }

  async post(user: AuthUser, id: string, idempotencyKey: string) {
    assertRequestCorrection(user);
    if (!idempotencyKey.trim()) {
      throw validation("Idempotency-Key header is required");
    }
    const existing = await this.prisma.correctionRequest.findUnique({
      where: { id },
      include: this.include(),
    });
    if (!existing) throw notFound("Correction not found");
    // A replay of an already-posted correction is a pure read of the stored
    // result, so it returns before any eligibility guard. Otherwise an approved
    // request created before the guard existed must still be refused at post
    // time, before the reversal/replacement writes happen.
    if (existing.status === CorrectionStatus.POSTED && existing.postingKey === idempotencyKey) {
      return this.toView(existing, user);
    }
    await this.assertOriginalCorrectable(
      this.prisma,
      existing.originalLedgerEntry,
      id,
      existing.proposedValues as Record<string, unknown>,
    );
    if (existing.status !== CorrectionStatus.APPROVED) {
      throw conflict("Only an approved correction can be posted");
    }
    if (existing.postingKey && existing.postingKey !== idempotencyKey) {
      throw conflict("This correction was already posted under a different key");
    }

    const original = existing.originalLedgerEntry;
    const proposed = existing.proposedValues as Record<string, unknown>;
    assertDisbursementAmountUnchanged(original, proposed);
    const replacementAmount = typeof proposed.amount === "string" ? proposed.amount : null;
    if (!replacementAmount) {
      throw validation("Proposed amount is required to post a correction", {
        amount: ["Amount is required"],
      });
    }
    if (!isPositive(replacementAmount.replace(/^-/, ""))) {
      throw validation("The corrected amount must be greater than zero", {
        amount: ["Enter an amount greater than zero"],
      });
    }
    // Ledger direction: repayments are stored negative, disbursements positive.
    const outgoing = original.amount.startsWith("-");
    const originalMagnitude = original.amount.replace(/^-/, "");
    // How much more the corrected receipt collects (negative when it collects less).
    const delta = toCents(replacementAmount.replace(/^-/, "")) - toCents(originalMagnitude);
    const reversalAmount = outgoing ? originalMagnitude : `-${originalMagnitude}`;
    const signedReplacement = outgoing
      ? `-${replacementAmount.replace(/^-/, "")}`
      : replacementAmount.replace(/^-/, "");

    await this.prisma.$transaction(async (tx) => {
      // Serialize on the loan row. Two approved corrections for the same
      // original (or a correction racing a repayment) could otherwise both read
      // the same stale schedule and each apply their delta, so the loan balance
      // would be adjusted twice. The lock is held until commit; the fresh guard
      // and schedule read below then see the other transaction's writes.
      await tx.$queryRaw`SELECT "id" FROM "Loan" WHERE "id" = ${original.loanId} FOR UPDATE`;

      const locked = await tx.correctionRequest.updateMany({
        where: { id, status: CorrectionStatus.APPROVED, postingKey: null },
        data: { postingKey: idempotencyKey },
      });
      if (locked.count === 0) {
        const replay = await tx.correctionRequest.findUnique({ where: { id } });
        if (
          replay &&
          replay.status === CorrectionStatus.POSTED &&
          replay.postingKey === idempotencyKey
        ) {
          return;
        }
        throw conflict("This correction was already posted or updated elsewhere");
      }

      // We now own this correction for the rest of the transaction. Refuse to
      // compound it on an original that a competing correction already posted
      // while we were waiting for the loan lock; the claim rolls back with it.
      await this.assertOriginalCorrectable(tx, original, id, proposed);

      // Corrections are money: the loan balance and settlement status must move
      // with the ledger, otherwise the books and the loan disagree and the
      // corrected amount only exists in the ledger.
      await this.reallocateForCorrection(tx, {
        loanId: original.loanId,
        originalLedgerEntryId: original.id,
        delta,
      });

      const reversal = await tx.ledgerEntry.create({
        data: {
          loanId: original.loanId,
          type: original.type,
          amount: reversalAmount,
          businessDate: original.businessDate,
          method: original.method,
          externalReference: original.externalReference,
          note: `Reversal for correction ${id}`,
          postedById: user.id,
        },
      });
      const replacement = await tx.ledgerEntry.create({
        data: {
          loanId: original.loanId,
          type: original.type,
          amount: signedReplacement,
          businessDate: proposed.businessDate
            ? new Date(proposed.businessDate as string)
            : original.businessDate,
          method: (proposed.method as string) ?? original.method,
          externalReference: (proposed.externalReference as string | null) ?? null,
          note: (proposed.note as string | null) ?? `Replacement for correction ${id}`,
          postedById: user.id,
        },
      });
      await tx.correctionRequest.update({
        where: { id },
        data: {
          status: CorrectionStatus.POSTED,
          reversalEntryId: reversal.id,
          replacementEntryId: replacement.id,
          version: { increment: 1 },
        },
      });
      await this.audit.write(
        {
          actorId: user.id,
          action: "correction.post",
          objectType: "CorrectionRequest",
          objectId: id,
          after: { reversalEntryId: reversal.id, replacementEntryId: replacement.id },
        },
        tx,
      );
    });

    const posted = await this.prisma.correctionRequest.findUnique({
      where: { id },
      include: this.include(),
    });
    return this.toView(posted!, user);
  }

  /**
   * Applies the difference between the original receipt and its replacement to
   * the repayment plan, then settles or reopens the loan to match.
   *
   * The schedule is the loan's source of truth for its balance, so a correction
   * that only wrote ledger rows would leave the balance reporting the old
   * figure. The original allocation is withdrawn first (using the receipt's
   * recorded allocations when it has them) and the corrected amount is applied
   * in due order, exactly as a fresh repayment would be.
   */
  private async reallocateForCorrection(
    tx: Prisma.TransactionClient,
    input: { loanId: string; originalLedgerEntryId: string; delta: number },
  ) {
    if (input.delta === 0) return;

    const entries = await tx.scheduleEntry.findMany({
      where: { loanId: input.loanId },
      orderBy: { number: "asc" },
    });
    const paid = new Map(
      entries.map((entry) => [
        entry.id,
        { amountCents: toCents(entry.amount), paidCents: toCents(entry.paidAmount) },
      ]),
    );

    let remaining = Math.abs(input.delta);
    if (input.delta > 0) {
      // Collecting more: fill the remaining installments in due order.
      for (const entry of entries) {
        if (remaining <= 0) break;
        const row = paid.get(entry.id)!;
        const due = row.amountCents - row.paidCents;
        if (due <= 0) continue;
        const applied = Math.min(due, remaining);
        row.paidCents += applied;
        remaining -= applied;
      }
      if (remaining > 0) {
        throw validation(
          "The corrected amount is more than the outstanding balance. Overpayment is not supported until the office provides a settlement policy.",
        );
      }
    } else {
      // Collecting less: withdraw the original allocation, newest installment
      // first, using the recorded allocation when the receipt still has it.
      const receipt = await tx.receipt.findUnique({
        where: { ledgerEntryId: input.originalLedgerEntryId },
        select: { summary: true },
      });
      const recorded = (receipt?.summary as { allocations?: unknown } | null)?.allocations;
      const order: string[] = [];
      if (Array.isArray(recorded)) {
        for (const item of recorded) {
          const entryId = (item as { entryId?: unknown }).entryId;
          if (typeof entryId === "string" && paid.has(entryId)) order.push(entryId);
        }
      }
      for (const entryId of order) {
        if (remaining <= 0) break;
        const row = paid.get(entryId)!;
        const applied = Math.min(row.paidCents, remaining);
        row.paidCents -= applied;
        remaining -= applied;
      }
      for (const entry of [...entries].reverse()) {
        if (remaining <= 0) break;
        if (order.includes(entry.id)) continue;
        const row = paid.get(entry.id)!;
        const applied = Math.min(row.paidCents, remaining);
        row.paidCents -= applied;
        remaining -= applied;
      }
      if (remaining > 0) {
        throw conflict(
          "The corrected amount cannot be withdrawn because the plan no longer holds that payment. Review the loan schedule first.",
        );
      }
    }

    for (const entry of entries) {
      const row = paid.get(entry.id)!;
      const nextPaid = fromCents(row.paidCents);
      if (nextPaid === entry.paidAmount) continue;
      await tx.scheduleEntry.update({
        where: { id: entry.id },
        data: {
          paidAmount: nextPaid,
          status: row.paidCents >= row.amountCents ? "PAID" : "PENDING",
        },
      });
    }

    const balance = entries.reduce((total, entry) => {
      const row = paid.get(entry.id)!;
      return total + (row.amountCents - row.paidCents);
    }, 0);
    const loan = await tx.loan.findUniqueOrThrow({ where: { id: input.loanId } });
    if (balance === 0 && loan.status !== LoanStatus.SETTLED) {
      await tx.loan.update({
        where: { id: loan.id },
        data: { status: LoanStatus.SETTLED, settledAt: new Date() },
      });
    } else if (balance > 0 && loan.status === LoanStatus.SETTLED) {
      // A correction that reopens a debt must reopen the loan too, or the
      // balance would be uncollectable.
      await tx.loan.update({
        where: { id: loan.id },
        data: { status: LoanStatus.ACTIVE, settledAt: null },
      });
    }
  }

  /**
   * Only a counter repayment can be corrected. The office has not supplied a
   * disbursement-adjustment or principal-correction policy, and a sale receipt
   * is recovered proceeds rather than a cashier entry to amend, so those are
   * refused explicitly rather than being forced through the repayment formula.
   * A reversal or replacement produced by an earlier correction is refused too,
   * so one correction cannot compound on another.
   *
   * An original that is already the subject of a POSTED correction is refused
   * as well: correcting it again would apply the replacement delta a second
   * time. `excludeCorrectionId` lets the current correction pass when it is
   * replayed, and any other already-posted correction for the same original
   * still blocks it.
   */
  private async assertOriginalCorrectable(
    client: Pick<Prisma.TransactionClient, "correctionRequest">,
    original: { id: string; type: string; amount: string },
    excludeCorrectionId: string | null = null,
    proposed: Record<string, unknown> = {},
  ) {
    if (original.type === LedgerEntryType.DISBURSEMENT) {
      if (typeof proposed.amount === "string") {
        throw validation(
          `Only repayment transactions can be corrected. This entry is a disbursement, and the office has not authorised a policy for disbursement or sale-receipt corrections.`,
        );
      }
    } else if (original.type !== LedgerEntryType.REPAYMENT) {
      throw validation(
        `Only repayment transactions can be corrected. This entry is a ${original.type
          .replaceAll("_", " ")
          .toLowerCase()}, and the office has not authorised a policy for disbursement or sale-receipt corrections.`,
      );
    }
    const derived = await client.correctionRequest.findFirst({
      where: {
        status: CorrectionStatus.POSTED,
        OR: [{ reversalEntryId: original.id }, { replacementEntryId: original.id }],
      },
      select: { id: true },
    });
    if (derived) {
      throw validation(
        "A reversal or replacement created by an earlier correction cannot itself be corrected. Record a new repayment correction against the live transaction instead.",
      );
    }
    const alreadyCorrected = await client.correctionRequest.findFirst({
      where: {
        status: CorrectionStatus.POSTED,
        originalLedgerEntryId: original.id,
        ...(excludeCorrectionId ? { id: { not: excludeCorrectionId } } : {}),
      },
      select: { id: true },
    });
    if (alreadyCorrected) {
      throw conflict(
        "This transaction has already been corrected. A second correction against the same entry would apply the change twice.",
      );
    }
  }

  private include() {
    return {
      requestedBy: { select: { name: true } },
      decidedBy: { select: { name: true } },
      originalLedgerEntry: {
        include: {
          loan: { select: { number: true, borrower: { select: { name: true } } } },
          postedBy: { select: { name: true } },
          receipt: { select: { id: true, number: true } },
        },
      },
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async toView(row: any, _user: AuthUser): Promise<CorrectionView> {
    const original = row.originalLedgerEntry;
    const canDecide = row.status === CorrectionStatus.REQUESTED;
    const canPost = row.status === CorrectionStatus.APPROVED;
    return {
      id: row.id,
      status: row.status as CorrectionStatus,
      version: row.version,
      originalLedgerEntryId: row.originalLedgerEntryId,
      originalTransaction: {
        id: original.id,
        loanId: original.loanId,
        loanNumber: original.loan.number,
        borrowerName: original.loan.borrower?.name ?? null,
        type: original.type as "DISBURSEMENT" | "REPAYMENT" | "SALE_RECEIPT",
        amount: original.amount,
        businessDate: original.businessDate.toISOString().slice(0, 10),
        method: original.method,
        externalReference: original.externalReference,
        note: original.note,
        postedBy: original.postedBy?.name ?? null,
        createdAt: original.createdAt.toISOString(),
        receiptId: original.receipt?.id ?? null,
        receiptNumber: original.receipt?.number ?? null,
      },
      proposedValues: row.proposedValues as Record<string, unknown>,
      reason: row.reason,
      requestedBy: row.requestedBy?.name ?? null,
      decidedBy: row.decidedBy?.name ?? null,
      decisionReason: row.decisionReason,
      reversalEntryId: row.reversalEntryId,
      replacementEntryId: row.replacementEntryId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      allowedActions: [
        {
          id: "decide",
          label: "Approve or reject",
          allowed: canDecide,
          ...(canDecide ? {} : { reason: "Only requested corrections can be decided" }),
        },
        {
          id: "post",
          label: "Post correction",
          allowed: canPost,
          ...(canPost ? {} : { reason: "Only approved corrections can be posted" }),
        },
      ],
    };
  }
}
