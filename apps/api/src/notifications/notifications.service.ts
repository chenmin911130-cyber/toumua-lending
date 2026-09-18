import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class NotificationsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async notify(userId: string, title: string, body: string, href?: string | null) {
    try {
      await this.prisma.notification.create({
        data: { userId, title, body, href: href ?? null },
      });
    } catch {
      // A missed inbox row must not roll back the business write.
    }
  }

  async notifyBorrower(borrowerId: string, title: string, body: string, href?: string | null) {
    const link = await this.prisma.borrowerAccountLink.findFirst({
      where: { borrowerId, status: "ACTIVE" },
      select: { userId: true },
    });
    if (!link) return;
    await this.notify(link.userId, title, body, href);
  }

  async notifyLendingStaff(title: string, body: string, href?: string | null) {
    const staff = await this.prisma.user.findMany({
      where: {
        status: "ACTIVE",
        role: { in: ["LOAN_OFFICER", "MANAGER", "OWNER"] },
      },
      select: { id: true },
    });
    await Promise.all(staff.map((row) => this.notify(row.id, title, body, href)));
  }

  async list(userId: string) {
    const [items, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return {
      items: items.map((row) => ({
        id: row.id,
        title: row.title,
        body: row.body,
        href: row.href,
        read: Boolean(row.readAt),
        createdAt: row.createdAt.toISOString(),
      })),
      nextCursor: null,
      total: items.length,
      unread,
    };
  }

  async markRead(userId: string, id: string) {
    const row = await this.prisma.notification.findFirst({ where: { id, userId } });
    if (!row) return null;
    if (!row.readAt) {
      await this.prisma.notification.update({
        where: { id },
        data: { readAt: new Date() },
      });
    }
    return { ok: true };
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    const unread = await this.prisma.notification.count({ where: { userId, readAt: null } });
    return { unread };
  }
}
