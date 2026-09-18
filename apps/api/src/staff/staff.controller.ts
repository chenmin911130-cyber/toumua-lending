import { Body, Controller, Get, Inject, Param, Patch, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  Permission,
  changePermissionsSchema,
  changeRoleSchema,
  changeStatusSchema,
  inviteStaffSchema,
} from "@toumua/contracts";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { RequirePermission, RequireStaff } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthUser } from "../auth/session";
import { StaffService } from "./staff.service";

@ApiTags("staff")
@RequireStaff()
@Controller("staff")
export class StaffController {
  constructor(@Inject(StaffService) private readonly staff: StaffService) {}

  @RequirePermission(Permission.MANAGE_STAFF)
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.staff.list(user);
  }

  @RequirePermission(Permission.MANAGE_STAFF)
  @Post()
  invite(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(inviteStaffSchema)) body: unknown,
  ) {
    return this.staff.invite(user, body as never);
  }

  @RequirePermission(Permission.MANAGE_STAFF)
  @Get(":id")
  get(@Param("id") id: string) {
    return this.staff.get(id);
  }

  @RequirePermission(Permission.MANAGE_STAFF)
  @Patch(":id/role")
  changeRole(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(changeRoleSchema)) body: unknown,
  ) {
    return this.staff.changeRole(user, id, body as never);
  }

  @RequirePermission(Permission.MANAGE_STAFF)
  @Patch(":id/permissions")
  changePermissions(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(changePermissionsSchema)) body: unknown,
  ) {
    return this.staff.changePermissions(user, id, body as never);
  }

  @RequirePermission(Permission.MANAGE_STAFF)
  @Patch(":id/status")
  changeStatus(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(changeStatusSchema)) body: unknown,
  ) {
    return this.staff.changeStatus(user, id, body as never);
  }

  @RequirePermission(Permission.MANAGE_STAFF)
  @Post(":id/resend-invitation")
  resend(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.staff.resendInvitation(user, id);
  }
}
