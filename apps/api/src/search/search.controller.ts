import { Controller, Get, Inject, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RequireStaff } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthUser } from "../auth/session";
import { assertManageLending, assertManageValuation, assertReadLedger } from "../lending/access";
import { PrismaService } from "../prisma/prisma.service";

function allows(check: () => void) {
  try {
    check();
    return true;
  } catch {
    return false;
  }
}

@ApiTags("search")
@RequireStaff()
@Controller("search")
export class SearchController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get()
  async search(@CurrentUser() user: AuthUser, @Query("q") q?: string) {
    const query = (q ?? "").trim();
    const canReadLedger = allows(() => assertReadLedger(user));
    const canReadFiles = allows(() => assertManageLending(user)) || allows(() => assertManageValuation(user));
    if (query.length < 2) {
      return {
        borrowers: [],
        applications: [],
        loans: [],
        assets: [],
        transactions: [],
      };
    }
    const empty = Promise.resolve([] as Array<{
      id: string;
      name?: string;
      number?: string;
      phone?: string;
      status?: string;
      identifier?: string | null;
      borrower?: { name: string } | null;
      application?: { id: string; number: string };
      type?: string;
      amount?: string;
      loan?: { number: string };
    }>);
    const [borrowers, applications, assets, loans, transactions] = await Promise.all([
      canReadFiles ? this.prisma.borrower.findMany({
        where: {
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { number: { contains: query, mode: "insensitive" } },
            { phone: { contains: query, mode: "insensitive" } },
          ],
        },
        take: 5,
        orderBy: { updatedAt: "desc" },
        select: { id: true, number: true, name: true, phone: true },
      }) : empty,
      canReadFiles ? this.prisma.application.findMany({
        where: {
          OR: [
            { number: { contains: query, mode: "insensitive" } },
            { borrower: { name: { contains: query, mode: "insensitive" } } },
          ],
        },
        take: 5,
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          number: true,
          status: true,
          borrower: { select: { name: true } },
        },
      }) : empty,
      canReadFiles ? this.prisma.applicationAsset.findMany({
        where: {
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { identifier: { contains: query, mode: "insensitive" } },
          ],
        },
        take: 5,
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          name: true,
          identifier: true,
          application: { select: { id: true, number: true } },
        },
      }) : empty,
      canReadLedger ? this.prisma.loan.findMany({
        where: {
          OR: [
            { number: { contains: query, mode: "insensitive" } },
            { borrower: { name: { contains: query, mode: "insensitive" } } },
          ],
        },
        take: 5,
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          number: true,
          status: true,
          borrower: { select: { name: true } },
        },
      }) : empty,
      canReadLedger ? this.prisma.ledgerEntry.findMany({
        where: {
          OR: [
            { loan: { number: { contains: query, mode: "insensitive" } } },
            { receipt: { number: { contains: query, mode: "insensitive" } } },
            { externalReference: { contains: query, mode: "insensitive" } },
          ],
        },
        take: 5,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          type: true,
          amount: true,
          loan: { select: { number: true } },
        },
      }) : empty,
    ]);
    return {
      borrowers: borrowers.map((row) => ({
        id: row.id,
        label: row.name,
        meta: row.number,
        href: `/staff/borrowers/${row.id}`,
      })),
      applications: applications.map((row) => ({
        id: row.id,
        label: row.number,
        meta: row.borrower?.name ?? row.status,
        href: `/staff/applications/${row.id}/edit/borrower`,
      })),
      loans: loans.map((row) => ({
        id: row.id,
        label: row.number,
        meta: `${row.borrower?.name ?? "Borrower"} · ${row.status}`,
        href: `/staff/loans/${row.id}`,
      })),
      assets: assets.map((row) => ({
        id: row.id,
        label: row.name,
        meta: row.application?.number ?? "",
        href: `/staff/applications/${row.application?.id ?? ""}/edit/security`,
      })),
      transactions: transactions.map((row) => ({
        id: row.id,
        label: `${row.type} ${row.amount}`,
        meta: row.loan?.number ?? "",
        href: `/staff/transactions/${row.id}`,
      })),
    };
  }
}
