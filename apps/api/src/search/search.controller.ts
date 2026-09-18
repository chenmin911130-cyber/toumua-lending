import { Controller, Get, Inject, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RequireStaff } from "../auth/auth.guard";
import { PrismaService } from "../prisma/prisma.service";

@ApiTags("search")
@RequireStaff()
@Controller("search")
export class SearchController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get()
  async search(@Query("q") q?: string) {
    const query = (q ?? "").trim();
    if (query.length < 2) {
      return {
        borrowers: [],
        applications: [],
        loans: [],
        assets: [],
        transactions: [],
      };
    }
    const [borrowers, applications, assets, loans, transactions] = await Promise.all([
      this.prisma.borrower.findMany({
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
      }),
      this.prisma.application.findMany({
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
      }),
      this.prisma.applicationAsset.findMany({
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
      }),
      this.prisma.loan.findMany({
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
      }),
      this.prisma.ledgerEntry.findMany({
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
      }),
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
        meta: row.application.number,
        href: `/staff/applications/${row.application.id}/edit/security`,
      })),
      transactions: transactions.map((row) => ({
        id: row.id,
        label: `${row.type} ${row.amount}`,
        meta: row.loan.number,
        href: `/staff/transactions/${row.id}`,
      })),
    };
  }
}
