import { Body, Controller, Get, Headers, HttpCode, Inject, Ip, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { reissueContractSchema, signContractSchema, signInBranchSchema } from "@toumua/contracts";
import { RequireStaff } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthUser } from "../auth/session";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ContractsService } from "./contracts.service";

@ApiTags("contracts")
@Controller()
export class ContractsController {
  constructor(@Inject(ContractsService) private readonly contracts: ContractsService) {}

  @Get("me/contracts/:id")
  forCustomer(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.contracts.getForCustomer(user.id, id);
  }

  @Post("me/contracts/:id/sign")
  @HttpCode(200)
  signPortal(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(signContractSchema)) body: {
      typedName: string;
      signaturePng: string;
      consent: true;
      contentSha256: string;
    },
    @Ip() ip: string,
    @Headers("user-agent") userAgent?: string,
  ) {
    return this.contracts.signPortal(user, id, body, { ip: ip || null, userAgent: userAgent ?? null });
  }

  @Get("contracts/:id")
  @RequireStaff()
  forStaff(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.contracts.getForStaff(user, id);
  }

  @Post("contracts/:id/sign-in-branch")
  @RequireStaff()
  @HttpCode(200)
  signInBranch(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(signInBranchSchema)) body: {
      typedName: string;
      signaturePng: string;
      borrowerPresent: true;
      contentSha256: string;
    },
    @Ip() ip: string,
    @Headers("user-agent") userAgent?: string,
  ) {
    return this.contracts.signInBranch(user, id, body, { ip: ip || null, userAgent: userAgent ?? null });
  }

  @Post("loans/:loanId/contract/reissue")
  @RequireStaff()
  @HttpCode(200)
  reissue(
    @CurrentUser() user: AuthUser,
    @Param("loanId") loanId: string,
    @Body(new ZodValidationPipe(reissueContractSchema)) body: { reason: string; contractId?: string },
  ) {
    return this.contracts.reissue(user, loanId, body.reason, body.contractId);
  }
}
