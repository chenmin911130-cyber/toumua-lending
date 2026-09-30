import { Inject, Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { CollectionPostInput } from "@toumua/contracts";
import { toPublicUser } from "../auth/session";
import type { AuthUser } from "../auth/session";
import { aucklandDay } from "../common/dates";
import { conflict, notFound, validation } from "../common/http";
import { Prisma } from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import { assertPostMoney, assertReadCollections } from "../lending/access";
import { MoneyService } from "../lending/money.service";
import { compare, subtract } from "../lending/money";
import { collectionKey } from "./arrangement-lifecycle";
import { CollectionDriver, SimulatedCollectionDriver } from "./collection-driver";

@Injectable()
export class CollectionsService {
  private readonly driver: CollectionDriver;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MoneyService) private readonly money: MoneyService,
  ) {
    this.driver = new SimulatedCollectionDriver();
  }

  @Cron("15 8 * * *", { timeZone: "Pacific/Auckland" })
  async tick(): Promise<void> {
    if (process.env.COLLECTION_CRON_ENABLED !== "1") return;
    if (process.env.NODE_ENV === "test") return;
    const cashier = await this.prisma.user.findFirst({
      where: { role: "CASHIER", status: "ACTIVE" },
      include: { permissions: true },
    });
    if (!cashier) return;
    const actor = { ...toPublicUser(cashier, false), sessionId: "collection-cron" };
    const date = aucklandDay();
    const due = await this.list(actor, date);
    for (const row of due.items) {
      try {
        await this.post(actor, row.scheduleEntryId, { received: true }, date);
      } catch {
        // A declined collection is stored on the attempt. The next run retries it.
      }
    }
  }

  async list(user: AuthUser, date: string) {
    assertReadCollections(user);
    const items = await this.dueItems(date);
    return { date, items };
  }

  async post(user: AuthUser, scheduleEntryId: string, input: CollectionPostInput, date = aucklandDay()) {
    assertPostMoney(user);
    const entry = await this.prisma.scheduleEntry.findUnique({
      where: { id: scheduleEntryId },
      include: {
        loan: { include: { borrower: { select: { name: true } } } },
      },
    });
    if (!entry) throw notFound("Installment not found");
    if (entry.loan.status !== "ACTIVE") {
      throw conflict("Automatic collections only run on active loans");
    }
    if (entry.status !== "PENDING") throw conflict("This installment is already paid");
    const arrangement = await this.prisma.repaymentArrangement.findFirst({
      where: { loanId: entry.loanId, status: "ACTIVE" },
    });
    if (!arrangement) throw conflict("This loan has no active automatic repayment");
    const owing = subtract(entry.amount, entry.paidAmount);
    if (compare(owing, "0.00") <= 0) throw conflict("This installment is already paid");
    const amount = input.amount ?? owing;
    if (compare(amount, owing) > 0) {
      throw validation("Cannot collect more than the outstanding installment", {
        amount: ["Cannot collect more than the outstanding installment"],
      });
    }
    const key = collectionKey(arrangement.id, entry.id, date);
    const collectionDate = new Date(`${date}T00:00:00.000Z`);
    const claimKey = {
      arrangementId: arrangement.id,
      scheduleEntryId: entry.id,
      collectionDate,
    };
    await this.claimAttempt(claimKey, key);
    const bank = await this.driver.collect({ amount, reference: key });
    if (!bank.ok) {
      await this.prisma.collectionAttempt.update({
        where: { arrangementId_scheduleEntryId_collectionDate: claimKey },
        data: { outcome: "FAILED", failureReason: bank.reason },
      });
      throw conflict(bank.reason);
    }
    const current = await this.prisma.loan.findUniqueOrThrow({ where: { id: entry.loanId } });
    let posted: Awaited<ReturnType<MoneyService["repay"]>>;
    try {
      posted = await this.money.repay(
        user,
        entry.loanId,
        {
          amount,
          method: "AUTOMATIC_PAYMENT",
          businessDate: date,
          externalReference: input.externalReference?.trim() || bank.externalReference,
          expectedVersion: current.version,
        },
        key,
      );
    } catch (error) {
      // The bank already took the money. FAILED would invite another charge.
      await this.prisma.collectionAttempt.update({
        where: { arrangementId_scheduleEntryId_collectionDate: claimKey },
        data: {
          outcome: "NEEDS_REVIEW",
          failureReason: error instanceof Error ? error.message : "Posting failed after the bank accepted the collection",
        },
      });
      throw error;
    }
    await this.prisma.collectionAttempt.update({
      where: { arrangementId_scheduleEntryId_collectionDate: claimKey },
      data: { outcome: "COLLECTED", failureReason: null },
    });
    return posted;
  }

  /**
   * The unique row is the claim. The loser must not call the bank.
   * A previous decline can be retried; a charge already in flight cannot.
   */
  private async claimAttempt(
    key: { arrangementId: string; scheduleEntryId: string; collectionDate: Date },
    idempotencyKey: string,
  ) {
    try {
      await this.prisma.collectionAttempt.create({
        data: { ...key, idempotencyKey, outcome: "PENDING" },
      });
      return;
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    }
    const existing = await this.prisma.collectionAttempt.findUnique({
      where: { arrangementId_scheduleEntryId_collectionDate: key },
    });
    if (!existing || existing.outcome !== "FAILED") {
      throw conflict("This collection was already claimed");
    }
    const claimed = await this.prisma.collectionAttempt.updateMany({
      where: { id: existing.id, outcome: "FAILED" },
      data: { outcome: "PENDING", failureReason: null, idempotencyKey },
    });
    if (claimed.count !== 1) throw conflict("This collection was already claimed");
  }

  private async dueItems(date: string) {
    const arrangements = await this.prisma.repaymentArrangement.findMany({
      where: { status: "ACTIVE", loan: { status: "ACTIVE" } },
      include: {
        loan: {
          include: {
            borrower: { select: { name: true } },
            schedule: { where: { status: "PENDING" }, orderBy: { number: "asc" } },
          },
        },
      },
    });
    const items = [];
    for (const arrangement of arrangements) {
      for (const entry of arrangement.loan.schedule) {
        const due = aucklandDay(entry.dueDate);
        if (due > date) continue;
        const amount = subtract(entry.amount, entry.paidAmount);
        if (compare(amount, "0.00") <= 0) continue;
        items.push({
          scheduleEntryId: entry.id,
          loanId: arrangement.loanId,
          loanNumber: arrangement.loan.number,
          borrowerName: arrangement.loan.borrower.name,
          installmentNumber: entry.number,
          amount,
          dueDate: due,
          idempotencyKey: collectionKey(arrangement.id, entry.id, date),
          arrangementId: arrangement.id,
        });
      }
    }
    return items;
  }
}
