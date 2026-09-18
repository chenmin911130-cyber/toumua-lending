import { Body, Controller, Get, Headers, Inject, Param, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  correctionDecisionSchema,
  correctionRequestSchema,
  cursorListQuerySchema,
} from "@toumua/contracts";
import { RequireStaff } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthUser } from "../auth/session";
import { validation } from "../common/http";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { CorrectionsService } from "./corrections.service";

@ApiTags("corrections")
@RequireStaff()
@Controller("corrections")
export class CorrectionsController {
  constructor(@Inject(CorrectionsService) private readonly correctionsService: CorrectionsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(cursorListQuerySchema)) query: unknown,
  ) {
    return this.correctionsService.list(user, query as never);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.correctionsService.get(user, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(correctionRequestSchema)) body: unknown,
  ) {
    return this.correctionsService.create(user, body as never);
  }

  @Post(":id/decision")
  decide(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(correctionDecisionSchema)) body: unknown,
  ) {
    return this.correctionsService.decide(user, id, body as never);
  }

  @Post(":id/post")
  post(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
  ) {
    if (!idempotencyKey?.trim()) throw validation("Idempotency-Key header is required");
    return this.correctionsService.post(user, id, idempotencyKey.trim());
  }
}
