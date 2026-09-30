import { Inject, Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { Prisma } from "../generated/prisma";
import type { ReminderRunResult } from "@toumua/contracts";
import { AuditService } from "../audit/audit.service";
import { addCalendarDays, aucklandDay, reminderDaysBefore } from "../common/dates";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { subtract } from "../lending/money";
import { SmsService } from "../sms/sms.service";

type ReminderKindName = "DUE_SOON" | "DUE_TODAY" | "OVERDUE";

type DueEntry = {
  entry: {
    id: string;
    number: number;
    dueDate: Date;
    amount: string;
    paidAmount: string;
    loan: {
      id: string;
      number: string;
      borrowerId: string;
      borrower: { phone: string };
    };
  };
  kind: ReminderKindName;
  due: string;
};

@Injectable()
export class RemindersService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SmsService) private readonly sms: SmsService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  @Cron("0 8 * * *", { timeZone: "Pacific/Auckland" })
  async tick(): Promise<void> {
    if (process.env.REMINDER_CRON_ENABLED !== "1") return;
    if (process.env.NODE_ENV === "test") return;
    await this.runDue();
  }

  async runDue(asOf: Date = new Date(), actorId?: string | null): Promise<ReminderRunResult> {
    const counts: ReminderRunResult = { dueSoon: 0, dueToday: 0, overdue: 0, skipped: 0, failed: 0 };
    const today = aucklandDay(asOf);
    const soon = addCalendarDays(today, reminderDaysBefore());
    const entries = await this.prisma.scheduleEntry.findMany({
      where: {
        status: "PENDING",
        loan: { status: "ACTIVE", borrower: { smsOptIn: true } },
        reminders: { none: { kind: "OVERDUE" } },
      },
      include: {
        loan: {
          select: {
            id: true,
            number: true,
            borrowerId: true,
            borrower: { select: { phone: true } },
          },
        },
      },
    });

    const dueSoonOrToday: DueEntry[] = [];
    const overdueByLoan = new Map<string, DueEntry[]>();
    for (const entry of entries) {
      const due = aucklandDay(entry.dueDate);
      const kind = reminderKind(due, today, soon);
      if (!kind) continue;
      const candidate: DueEntry = { entry, kind, due };
      if (kind === "OVERDUE") {
        const list = overdueByLoan.get(entry.loan.id) ?? [];
        list.push(candidate);
        overdueByLoan.set(entry.loan.id, list);
      } else {
        dueSoonOrToday.push(candidate);
      }
    }

    for (const candidate of dueSoonOrToday) {
      await this.sendClaimed(candidate, counts, actorId);
    }

    // One overdue text per loan per run: the oldest installment that does not
    // already have an OVERDUE reminder. The next run the same day sends the
    // next oldest, still one. The unique key stops two runs claiming the same row.
    for (const [loanId, list] of overdueByLoan) {
      list.sort((a, b) => a.due.localeCompare(b.due) || a.entry.number - b.entry.number);
      await this.sendOneOverdue(loanId, today, counts, actorId);
    }

    return counts;
  }

  /** Claims the reminder row, then sends. A lost claim means another run owns it. */
  /**
   * One overdue text per loan. A second run that starts while this one still
   * holds the lock sends nothing; a later run sends the next oldest installment.
   */
  private async sendOneOverdue(
    loanId: string,
    today: string,
    counts: ReminderRunResult,
    actorId?: string | null,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const gate = await tx.$queryRaw<Array<{ locked: boolean }>>`
        SELECT pg_try_advisory_xact_lock(hashtextextended(${loanId}, 0)) AS locked
      `;
      if (!gate[0]?.locked) return;
      const entries = await tx.scheduleEntry.findMany({
        where: {
          loanId,
          status: "PENDING",
          reminders: { none: { kind: "OVERDUE" } },
        },
        include: {
          loan: {
            select: {
              id: true,
              number: true,
              borrowerId: true,
              borrower: { select: { phone: true } },
            },
          },
        },
        orderBy: [{ dueDate: "asc" }, { number: "asc" }],
      });
      const entry = entries.find((row) => aucklandDay(row.dueDate) < today);
      if (!entry) return;
      let claimed: { id: string };
      try {
        claimed = await tx.repaymentReminder.create({
          data: { scheduleEntryId: entry.id, kind: "OVERDUE" },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return;
        throw error;
      }
      const candidate: DueEntry = { entry, kind: "OVERDUE", due: aucklandDay(entry.dueDate) };
      await this.deliver(tx, claimed.id, candidate, counts, actorId);
    });
  }

  private async sendClaimed(
    candidate: DueEntry,
    counts: ReminderRunResult,
    actorId?: string | null,
  ): Promise<"sent" | "lost" | "failed"> {
    const claimed = await this.claim(candidate.entry.id, candidate.kind);
    if (!claimed) return "lost";
    return this.deliver(this.prisma, claimed.id, candidate, counts, actorId);
  }

  private async deliver(
    tx: Prisma.TransactionClient | PrismaService,
    reminderId: string,
    candidate: DueEntry,
    counts: ReminderRunResult,
    actorId?: string | null,
  ): Promise<"sent" | "failed"> {
    const { entry, kind } = candidate;

    const body = reminderBody(
      kind,
      subtract(entry.amount, entry.paidAmount),
      entry.loan.number,
      entry.dueDate,
      await this.hasActiveArrangement(entry.loan.id),
    );
    const sent = await this.sms.send({
      toPhone: entry.loan.borrower.phone,
      body,
      borrowerId: entry.loan.borrowerId,
      loanId: entry.loan.id,
    });
    if (sent.status === "FAILED") {
      await tx.repaymentReminder.delete({ where: { id: reminderId } });
      counts.failed += 1;
      return "failed";
    }
    if (sent.id) {
      await tx.repaymentReminder.update({
        where: { id: reminderId },
        data: { smsMessageId: sent.id },
      });
    }
    if (sent.status === "SKIPPED") {
      counts.skipped += 1;
    } else if (kind === "DUE_SOON") {
      counts.dueSoon += 1;
    } else if (kind === "DUE_TODAY") {
      counts.dueToday += 1;
    } else {
      counts.overdue += 1;
    }

    try {
      await this.notifications.notifyBorrower(
        entry.loan.borrowerId,
        "Repayment reminder",
        body,
        `/customer/loans/${entry.loan.id}`,
      );
    } catch {
      // The in-app row is a copy of the SMS. Missing it does not unwind the reminder.
    }

    await this.audit.write({
      actorId: actorId ?? null,
      action: "reminder.send",
      objectType: "ScheduleEntry",
      objectId: entry.id,
      after: { kind, status: sent.status, loanId: entry.loan.id },
    });
    return "sent";
  }

  private async hasActiveArrangement(loanId: string) {
    const row = await this.prisma.repaymentArrangement.findFirst({
      where: { loanId, status: "ACTIVE" },
      select: { id: true },
    });
    return row != null;
  }

  /**
   * Inserts the reminder row first. A unique violation means this installment
   * and kind were already claimed, including by a concurrent run.
   */
  private async claim(scheduleEntryId: string, kind: ReminderKindName) {
    try {
      return await this.prisma.repaymentReminder.create({
        data: { scheduleEntryId, kind },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return null;
      }
      throw error;
    }
  }
}

function reminderKind(due: string, today: string, soon: string): ReminderKindName | null {
  if (due === today) return "DUE_TODAY";
  if (due === soon) return "DUE_SOON";
  if (due < today) return "OVERDUE";
  return null;
}

function reminderBody(
  kind: ReminderKindName,
  amount: string,
  loanNumber: string,
  due: Date,
  automatic = false,
): string {
  const money = `$${amount}`;
  const when = formatReminderDate(due);
  if (kind === "DUE_SOON" && automatic) {
    return `Toumu'a Lending: repayment of ${money} for loan ${loanNumber} will be collected automatically on ${when}.`;
  }
  if (kind === "DUE_SOON") {
    return `Toumu'a Lending: repayment of ${money} for loan ${loanNumber} is due on ${when}. Reply or call us if you need help.`;
  }
  if (kind === "DUE_TODAY") {
    return `Toumu'a Lending: repayment of ${money} for loan ${loanNumber} is due today.`;
  }
  return `Toumu'a Lending: repayment of ${money} for loan ${loanNumber} was due on ${when} and is now overdue. Please contact us.`;
}

function formatReminderDate(due: Date): string {
  return new Intl.DateTimeFormat("en-NZ", {
    timeZone: "Pacific/Auckland",
    weekday: "short",
    day: "numeric",
    month: "short",
  })
    .format(due)
    .replace(/,/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
