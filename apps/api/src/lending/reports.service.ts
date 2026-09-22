import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import { fromCents, toCents } from "./money";

function moneyText(raw: string | null | undefined): string {
  const trimmed = (raw ?? "0").trim();
  if (!trimmed || trimmed === "0") return "0.00";
  return fromCents(toCents(trimmed));
}

function aucklandDay(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Pacific/Auckland",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

@Injectable()
export class ReportsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async businessStatus() {
    const today = aucklandDay();
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [loanGroups, applicationGroups, outstanding, movement, dueToday, overdue] = await Promise.all([
      this.prisma.loan.groupBy({ by: ["status"], _count: { _all: true } }),
      this.prisma.application.groupBy({ by: ["status"], _count: { _all: true } }),
      this.scalar(`
        SELECT TRIM(TO_CHAR(ROUND(COALESCE(SUM(s."amount"::numeric - s."paidAmount"::numeric), 0), 2), '9999999990.00')) AS total
        FROM "ScheduleEntry" s
        INNER JOIN "Loan" l ON l.id = s."loanId"
        WHERE l.status IN ('ACTIVE', 'DEFAULTED')
      `),
      this.movement(since),
      this.countOnDay(today),
      this.countBeforeDay(today),
    ]);

    const loans = this.counts(loanGroups, ["ACTIVE", "DEFAULTED", "SETTLED", "APPROVED_UNFUNDED"]);
    const applications = this.counts(applicationGroups, ["DRAFT", "SUBMITTED", "APPROVED", "DECLINED"]);
    return {
      asOf: new Date().toISOString(),
      loans: {
        active: loans.ACTIVE ?? 0,
        defaulted: loans.DEFAULTED ?? 0,
        settled: loans.SETTLED ?? 0,
        total: Object.values(loans).reduce((sum, count) => sum + count, 0),
      },
      applications: {
        draft: applications.DRAFT ?? 0,
        submitted: applications.SUBMITTED ?? 0,
        approved: applications.APPROVED ?? 0,
        declined: applications.DECLINED ?? 0,
      },
      money: {
        outstandingPrincipal: moneyText(outstanding),
        disbursedLast30Days: movement.disbursed,
        repaidLast30Days: movement.repaid,
        saleReceiptsLast30Days: movement.saleReceipts,
      },
      dueToday,
      overdue,
    };
  }

  private counts(
    groups: Array<{ status: string; _count: { _all: number } }>,
    keys: string[],
  ) {
    const result: Record<string, number> = {};
    for (const key of keys) result[key] = 0;
    for (const group of groups) {
      result[group.status] = group._count._all;
    }
    return result;
  }

  private async scalar(sql: string): Promise<string> {
    const rows = await this.prisma.$queryRaw<Array<{ total: string | null }>>(Prisma.raw(sql));
    return rows[0]?.total ?? "0.00";
  }

  private async movement(since: Date) {
    const rows = await this.prisma.$queryRaw<Array<{ type: string; total: string | null }>>(Prisma.sql`
      SELECT type,
             TRIM(TO_CHAR(ROUND(COALESCE(SUM(ABS("amount"::numeric)), 0), 2), '9999999990.00')) AS total
      FROM "LedgerEntry"
      WHERE "businessDate" >= ${since}
        AND type IN ('DISBURSEMENT', 'REPAYMENT', 'SALE_RECEIPT')
      GROUP BY type
    `);
    const byType = new Map(rows.map((row) => [row.type, moneyText(row.total)]));
    return {
      disbursed: byType.get("DISBURSEMENT") ?? "0.00",
      repaid: byType.get("REPAYMENT") ?? "0.00",
      saleReceipts: byType.get("SALE_RECEIPT") ?? "0.00",
    };
  }

  private async countOnDay(today: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
      SELECT COUNT(DISTINCT l.id)::int AS count
      FROM "ScheduleEntry" s
      INNER JOIN "Loan" l ON l.id = s."loanId"
      WHERE s.status = 'PENDING'
        AND l.status = 'ACTIVE'
        AND (("dueDate" AT TIME ZONE 'UTC') AT TIME ZONE 'Pacific/Auckland')::date = ${today}::date
    `);
    return rows[0]?.count ?? 0;
  }

  private async countBeforeDay(today: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
      SELECT COUNT(DISTINCT l.id)::int AS count
      FROM "ScheduleEntry" s
      INNER JOIN "Loan" l ON l.id = s."loanId"
      WHERE s.status = 'PENDING'
        AND l.status = 'ACTIVE'
        AND (("dueDate" AT TIME ZONE 'UTC') AT TIME ZONE 'Pacific/Auckland')::date < ${today}::date
    `);
    return rows[0]?.count ?? 0;
  }
}
