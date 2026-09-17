import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AuditService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async write(input: {
    actorId?: string | null;
    action: string;
    objectType: string;
    objectId: string;
    before?: unknown;
    after?: unknown;
    reason?: string | null;
  }) {
    return this.prisma.auditEvent.create({
      data: {
        actorId: input.actorId ?? null,
        action: input.action,
        objectType: input.objectType,
        objectId: input.objectId,
        before: input.before === undefined ? undefined : (input.before as Prisma.InputJsonValue),
        after: input.after === undefined ? undefined : (input.after as Prisma.InputJsonValue),
        reason: input.reason ?? null,
      },
    });
  }

  async list(query: { cursor?: string; limit?: number }) {
    const limit = query.limit ?? 20;
    const items = await this.prisma.auditEvent.findMany({
      take: limit + 1,
      ...(query.cursor ? { skip: 1, cursor: { id: query.cursor } } : {}),
      orderBy: { createdAt: "desc" },
      include: { actor: { select: { id: true, name: true, email: true } } },
    });
    const next = items.length > limit ? items.pop() : null;
    const total = await this.prisma.auditEvent.count();
    return {
      items: items.map((event) => ({
        id: event.id,
        actorId: event.actorId,
        actorName: event.actor?.name ?? null,
        action: event.action,
        objectType: event.objectType,
        objectId: event.objectId,
        before: event.before,
        after: event.after,
        reason: event.reason,
        createdAt: event.createdAt.toISOString(),
      })),
      nextCursor: next?.id ?? null,
      total,
    };
  }

  async get(id: string) {
    return this.prisma.auditEvent.findUnique({
      where: { id },
      include: { actor: { select: { id: true, name: true } } },
    });
  }
}
