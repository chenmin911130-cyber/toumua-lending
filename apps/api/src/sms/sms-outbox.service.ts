import { Inject, Injectable } from "@nestjs/common";
import { CursorListQuery, SmsOutboxItem } from "@toumua/contracts";
import { AuthUser } from "../auth/session";
import { PrismaService } from "../prisma/prisma.service";
import { assertReadSmsOutbox } from "../lending/access";
import { maskSmsPhone } from "./phone";

@Injectable()
export class SmsOutboxService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(user: AuthUser, query: CursorListQuery) {
    assertReadSmsOutbox(user);
    const limit = query.limit ?? 20;
    const rows = await this.prisma.smsMessage.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: { borrower: { select: { name: true } } },
    });
    const page = rows.slice(0, limit);
    const next = rows.length > limit ? rows[limit] : null;
    const items: SmsOutboxItem[] = page.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      phoneMasked: maskSmsPhone(row.toPhone),
      borrowerName: row.borrower?.name ?? null,
      body: row.body,
      status: row.status,
      loanId: row.loanId,
    }));
    return {
      items,
      nextCursor: next?.id ?? null,
      total: await this.prisma.smsMessage.count(),
    };
  }
}
