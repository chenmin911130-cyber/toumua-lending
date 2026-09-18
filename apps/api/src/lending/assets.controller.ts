import { Body, Controller, Get, Inject, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  cursorListQuerySchema,
  custodyUpdateSchema,
  intakeSchema,
  returnSchema,
  saleDraftSchema,
  saleSchema,
} from "@toumua/contracts";
import { RequireStaff } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthUser } from "../auth/session";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { CustodyService } from "./custody.service";

@ApiTags("assets")
@RequireStaff()
@Controller("assets")
export class AssetsController {
  constructor(@Inject(CustodyService) private readonly custodyService: CustodyService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(cursorListQuerySchema)) query: unknown,
  ) {
    return this.custodyService.list(user, query as never);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.custodyService.get(user, id);
  }

  @Post(":id/intake")
  intake(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(intakeSchema)) body: unknown,
  ) {
    return this.custodyService.intake(user, id, body as never);
  }

  @Patch(":id/custody")
  updateCustody(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(custodyUpdateSchema)) body: unknown,
  ) {
    return this.custodyService.updateCustody(user, id, body as never);
  }

  @Post(":id/return")
  returnAsset(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(returnSchema)) body: unknown,
  ) {
    return this.custodyService.returnAsset(user, id, body as never);
  }

  @Post(":id/sale-draft")
  saveSaleDraft(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(saleDraftSchema)) body: unknown,
  ) {
    return this.custodyService.saveSaleDraft(user, id, body as never);
  }

  @Post(":id/sale")
  confirmSale(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(saleSchema)) body: unknown,
  ) {
    return this.custodyService.confirmSale(user, id, body as never);
  }
}
