import { Controller, Get, Inject, Param, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Permission } from "@toumua/contracts";
import { RequirePermission, RequireStaff } from "../auth/auth.guard";
import { AuditService } from "./audit.service";
import { notFound } from "../common/http";

@ApiTags("audit")
@RequireStaff()
@RequirePermission(Permission.VIEW_AUDIT)
@Controller()
export class AuditController {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  @Get("audit-events")
  list(@Query("cursor") cursor?: string, @Query("limit") limit?: string) {
    return this.audit.list({
      cursor,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get("audit-events/:id")
  async get(@Param("id") id: string) {
    const event = await this.audit.get(id);
    if (!event) {
      throw notFound();
    }
    return {
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
    };
  }
}
