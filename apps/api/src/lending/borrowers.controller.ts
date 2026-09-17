import { Body, Controller, Get, Inject, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  cursorListQuerySchema,
  linkAccountSchema,
  revokeLinkSchema,
  saveBorrowerSchema,
} from "@toumua/contracts";
import { RequireStaff } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthUser } from "../auth/session";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { BorrowersService } from "./borrowers.service";

@ApiTags("borrowers")
@RequireStaff()
@Controller()
export class BorrowersController {
  constructor(@Inject(BorrowersService) private readonly borrowers: BorrowersService) {}

  @Get("borrowers")
  list(@Query(new ZodValidationPipe(cursorListQuerySchema)) query: unknown) {
    return this.borrowers.list(query as never);
  }

  @Post("borrowers")
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(saveBorrowerSchema)) body: unknown,
  ) {
    return this.borrowers.create(user, body as never);
  }

  @Get("borrowers/:id")
  get(@Param("id") id: string) {
    return this.borrowers.get(id);
  }

  @Patch("borrowers/:id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(saveBorrowerSchema)) body: unknown,
  ) {
    return this.borrowers.update(user, id, body as never);
  }

  @Get("verified-accounts")
  verifiedAccounts(@Query("q") q?: string) {
    return this.borrowers.searchVerifiedAccounts(q ?? "");
  }

  @Post("borrowers/:id/account-link")
  linkAccount(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(linkAccountSchema)) body: unknown,
  ) {
    return this.borrowers.linkAccount(user, id, body as never);
  }

  @Post("borrowers/:id/account-link/revoke")
  revokeLink(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(revokeLinkSchema)) body: unknown,
  ) {
    return this.borrowers.revokeLink(user, id, (body as { reason: string }).reason);
  }
}
