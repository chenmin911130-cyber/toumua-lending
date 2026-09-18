import { Body, Controller, Get, Inject, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { decisionSchema } from "@toumua/contracts";
import { RequireStaff } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthUser } from "../auth/session";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { DecisionsService } from "./decisions.service";

@ApiTags("decisions")
@RequireStaff()
@Controller("applications")
export class DecisionsController {
  constructor(@Inject(DecisionsService) private readonly decisionsService: DecisionsService) {}

  @Get(":id/review")
  review(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.decisionsService.review(user, id);
  }

  @Post(":id/decision")
  decide(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(decisionSchema)) body: unknown,
  ) {
    return this.decisionsService.decide(user, id, body as never);
  }
}
