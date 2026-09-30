import { Inject, Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { Prisma } from "../generated/prisma";
import { AuditService } from "../audit/audit.service";
import { addCalendarDays, aucklandDay, reminderDaysBefore } from "../common/dates";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { subtract } from "../lending/money";
import { SmsService } from "../sms/sms.service";

type ReminderKindName = "DUE_SOON" | "DUE_TODAY" | "OVERDUE";

export type ReminderRunResult = {
  dueSoon: number;
  dueToday: number;
  overdue: number;
  skipped: number;
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
    const counts: ReminderRunResult = { dueSoon: 0, dueToday: 0, overdue: 0, skipped: 0 };
    const today = aucklandDay(asOf);
    const soon = addCalendarDays(today, reminderDaysBefore());
    const entries = await this.prisma.scheduleEntry.findMany({
      where: {
        status: "PENDING",
        loan: { status: "ACTIVE", borrower: { smsOptIn: true } },
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

    for (const entry of entries) {
      const due = aucklandDay(entry.dueDate);
      const kind = reminderKind(due, today, soon);
      if (!kind) continue;
      const claimed = await this.claim(entry.id, kind);
      if (!claimed) continue;

      const body = reminderBody(kind, subtract(entry.amount, entry.paidAmount), entry.loan.number, entry.dueDate);
      const sent = await this.sms.send({
        toPhone: entry.loan.borrower.phone,
        body,
        borrowerId: entry.loan.borrowerId,
        loanId: entry.loan.id,
      });
      if (sent.id) {
        await this.prisma.repaymentReminder.update({
          where: { id: claimed.id },
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
    }

    return counts;
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

function reminderBody(kind: ReminderKindName, amount: string, loanNumber: string, due: Date): string {
  const money = `$${amount}`;
  const when = formatReminderDate(due);
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
