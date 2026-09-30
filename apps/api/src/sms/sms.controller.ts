import { Controller, Get, Inject, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { cursorListQuerySchema } from "@toumua/contracts";
import { RequireStaff } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthUser } from "../auth/session";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { SmsOutboxService } from "./sms-outbox.service";

@ApiTags("sms")
@RequireStaff()
@Controller("sms-outbox")
export class SmsController {
  constructor(@Inject(SmsOutboxService) private readonly outbox: SmsOutboxService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(cursorListQuerySchema)) query: unknown,
  ) {
    return this.outbox.list(user, query as never);
  }
}
