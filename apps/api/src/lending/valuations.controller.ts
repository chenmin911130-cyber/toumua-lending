import { Body, Controller, Get, Inject, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { completeValuationSchema } from "@toumua/contracts";
import { RequireStaff } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthUser } from "../auth/session";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ValuationsService } from "./valuations.service";

@ApiTags("valuations")
@RequireStaff()
@Controller("valuations")
export class ValuationsController {
  constructor(@Inject(ValuationsService) private readonly valuations: ValuationsService) {}

  @Get("queue")
  queue(@CurrentUser() user: AuthUser) {
    return this.valuations.listQueue(user);
  }

  @Post(":id/complete")
  complete(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(completeValuationSchema)) body: unknown,
  ) {
    return this.valuations.complete(user, id, body as never);
  }
}
