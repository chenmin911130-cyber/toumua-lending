import { Inject, Injectable } from "@nestjs/common";
import {
  BorrowerSummary,
  CursorListQuery,
  LinkAccountInput,
  SaveBorrowerInput,
  normalizeEmail,
} from "@toumua/contracts";
import { AuthUser } from "../auth/session";
import { conflict, forbidden, notFound, validation } from "../common/http";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { assertManageAccountLink, assertManageLending, assertRevokeAccountLink } from "./access";
import { NotificationsService } from "../notifications/notifications.service";
import { NumbersService } from "./numbers.service";

@Injectable()
export class BorrowersService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(NumbersService) private readonly numbers: NumbersService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  async list(user: AuthUser, query: CursorListQuery) {
    assertManageLending(user);
    const limit = query.limit ?? 20;
    const q = (query.q ?? "").trim();
    const where =
      q.length >= 1
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { phone: { contains: q, mode: "insensitive" as const } },
              { number: { contains: q, mode: "insensitive" as const } },
              { email: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {};
    const items = await this.prisma.borrower.findMany({
      where,
      take: limit + 1,
      ...(query.cursor ? { skip: 1, cursor: { id: query.cursor } } : {}),
      orderBy: { updatedAt: "desc" },
      include: {
        accountLinks: {
          where: { status: "ACTIVE" },
          take: 1,
          select: { userId: true },
        },
      },
    });
    const next = items.length > limit ? items.pop() : null;
    const total = await this.prisma.borrower.count({ where });
    return {
      items: items.map((row) => this.toSummary(row)),
      nextCursor: next?.id ?? null,
      total,
    };
  }

  async get(user: AuthUser, id: string) {
    assertManageLending(user);
    return this.loadDetail(id);
  }

  /** Detail shape without its own role check; callers assert the role they need. */
  private async loadDetail(id: string) {
    const row = await this.prisma.borrower.findUnique({
      where: { id },
      include: {
        accountLinks: {
          where: { status: "ACTIVE" },
          take: 1,
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
    });
    if (!row) throw notFound("Borrower not found");
    const link = row.accountLinks[0];
    return {
      ...this.toSummary(row),
      linkedUser: link
        ? { id: link.user.id, name: link.user.name, email: link.user.email }
        : null,
      linkId: link?.id ?? null,
    };
  }

  async create(user: AuthUser, input: SaveBorrowerInput) {
    assertManageLending(user);
    const number = await this.numbers.nextBorrowerNumber();
    const row = await this.prisma.borrower.create({
      data: {
        number,
        name: input.name.trim(),
        salutation: input.salutation?.trim() || null,
        email: input.email?.trim() || null,
        phone: input.phone.trim(),
        address: input.address.trim(),
        notes: input.notes?.trim() || null,
        createdById: user.id,
      },
    });
    await this.audit.write({
      actorId: user.id,
      action: "borrower.create",
      objectType: "Borrower",
      objectId: row.id,
      after: row,
    });
    return this.loadDetail(row.id);
  }

  async update(user: AuthUser, id: string, input: SaveBorrowerInput) {
    assertManageLending(user);
    const existing = await this.prisma.borrower.findUnique({ where: { id } });
    if (!existing) throw notFound("Borrower not found");
    const row = await this.prisma.borrower.update({
      where: { id },
      data: {
        name: input.name.trim(),
        salutation: input.salutation?.trim() || null,
        email: input.email?.trim() || null,
        phone: input.phone.trim(),
        address: input.address.trim(),
        notes: input.notes?.trim() || null,
      },
    });
    await this.audit.write({
      actorId: user.id,
      action: "borrower.update",
      objectType: "Borrower",
      objectId: row.id,
      before: existing,
      after: row,
    });
    return this.loadDetail(row.id);
  }

  async linkAccount(user: AuthUser, borrowerId: string, input: LinkAccountInput) {
    assertManageAccountLink(user);
    const borrower = await this.prisma.borrower.findUnique({ where: { id: borrowerId } });
    if (!borrower) throw notFound("Borrower not found");
    const customer = await this.prisma.user.findUnique({ where: { id: input.userId } });
    if (!customer || customer.role !== "CUSTOMER") {
      throw validation("Select a verified customer account");
    }
    if (!customer.emailVerifiedAt) {
      throw validation("Customer email must be verified before linking");
    }
    const activeForUser = await this.prisma.borrowerAccountLink.findFirst({
      where: { userId: input.userId, status: "ACTIVE" },
    });
    if (activeForUser && activeForUser.borrowerId !== borrowerId) {
      throw conflict("This customer account is already linked to another borrower");
    }
    const activeForBorrower = await this.prisma.borrowerAccountLink.findFirst({
      where: { borrowerId, status: "ACTIVE" },
    });
    if (activeForBorrower && activeForBorrower.userId !== input.userId) {
      throw conflict("This borrower is already linked to another customer account");
    }
    if (activeForBorrower) {
      return this.loadDetail(borrowerId);
    }
    const link = await this.prisma.borrowerAccountLink.create({
      data: {
        borrowerId,
        userId: input.userId,
        verificationMethod: input.verificationMethod.trim(),
        notes: input.notes?.trim() || null,
        linkedById: user.id,
      },
    });
    await this.audit.write({
      actorId: user.id,
      action: "borrower.account_link.create",
      objectType: "BorrowerAccountLink",
      objectId: link.id,
      after: link,
    });
    await this.notifications.notify(
      input.userId,
      "Your loan record is now linked",
      `The office linked your account to ${borrower.name}. You can now view applications and loans.`,
      "/customer",
    );
    return this.loadDetail(borrowerId);
  }

  async revokeLink(user: AuthUser, borrowerId: string, reason: string) {
    assertRevokeAccountLink(user);
    const link = await this.prisma.borrowerAccountLink.findFirst({
      where: { borrowerId, status: "ACTIVE" },
    });
    if (!link) throw notFound("No active account link");
    const updated = await this.prisma.borrowerAccountLink.update({
      where: { id: link.id },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
    await this.audit.write({
      actorId: user.id,
      action: "borrower.account_link.revoke",
      objectType: "BorrowerAccountLink",
      objectId: link.id,
      before: link,
      after: updated,
      reason,
    });
    return this.loadDetail(borrowerId);
  }

  async searchVerifiedAccounts(user: AuthUser, q: string) {
    assertManageAccountLink(user);
    const query = q.trim();
    if (query.length < 2) return { items: [] as Array<{ id: string; name: string; email: string }> };
    const items = await this.prisma.user.findMany({
      where: {
        role: "CUSTOMER",
        emailVerifiedAt: { not: null },
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { emailNormalized: { contains: normalizeEmail(query) } },
        ],
      },
      take: 20,
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    });
    return { items };
  }

  private toSummary(
    row: {
      id: string;
      number: string;
      name: string;
      salutation: string | null;
      email: string | null;
      phone: string;
      address: string;
      notes: string | null;
      createdAt: Date;
      updatedAt: Date;
      accountLinks?: { userId: string }[];
    },
  ): BorrowerSummary {
    return {
      id: row.id,
      number: row.number,
      name: row.name,
      salutation: row.salutation,
      email: row.email,
      phone: row.phone,
      address: row.address,
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      linkedUserId: row.accountLinks?.[0]?.userId ?? null,
    };
  }
}
