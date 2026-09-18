import { Body, Controller, Delete, Get, Inject, Param, Patch, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import {
  patchApplicationSchema,
  saveAssetSchema,
  saveBorrowerSchema,
} from "@toumua/contracts";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthUser } from "../auth/session";
import { forbidden } from "../common/http";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ApplicationsService } from "../lending/applications.service";
import { LoansService } from "../lending/loans.service";
import { MoneyService } from "../lending/money.service";

const submitSchema = z.object({
  expectedVersion: z.number().int().positive(),
});

@ApiTags("customer")
@Controller("me")
export class CustomerController {
  constructor(
    @Inject(ApplicationsService) private readonly applicationsService: ApplicationsService,
    @Inject(LoansService) private readonly loansService: LoansService,
    @Inject(MoneyService) private readonly moneyService: MoneyService,
  ) {}

  @Get("loans")
  loans(@CurrentUser() user: AuthUser) {
    this.assertCustomer(user);
    return this.loansService.listForCustomer(user.id);
  }

  @Get("borrower")
  borrower(@CurrentUser() user: AuthUser) {
    this.assertCustomer(user);
    return this.applicationsService.getBorrowerForCustomer(user.id);
  }

  @Get("applications")
  applications(@CurrentUser() user: AuthUser) {
    this.assertCustomer(user);
    return this.applicationsService.listForCustomer(user.id);
  }

  @Post("applications")
  createApplication(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(saveBorrowerSchema)) body: unknown,
  ) {
    this.assertCustomer(user);
    return this.applicationsService.createForCustomer(user, body as never);
  }

  @Get("applications/:id")
  application(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    this.assertCustomer(user);
    return this.applicationsService.getForCustomer(user.id, id);
  }

  @Patch("applications/:id")
  patchApplication(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(patchApplicationSchema)) body: unknown,
  ) {
    this.assertCustomer(user);
    return this.applicationsService.patch(user, id, body as never);
  }

  @Post("applications/:id/assets")
  addAsset(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(saveAssetSchema)) body: unknown,
  ) {
    this.assertCustomer(user);
    return this.applicationsService.addAsset(user, id, body as never);
  }

  @Patch("applications/:id/assets/:assetId")
  updateAsset(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("assetId") assetId: string,
    @Body(new ZodValidationPipe(saveAssetSchema)) body: unknown,
  ) {
    this.assertCustomer(user);
    return this.applicationsService.updateAsset(user, id, assetId, body as never);
  }

  @Delete("applications/:id/assets/:assetId")
  deleteAsset(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("assetId") assetId: string,
  ) {
    this.assertCustomer(user);
    return this.applicationsService.deleteAsset(user, id, assetId);
  }

  @Post("applications/:id/submit")
  submit(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(submitSchema)) body: unknown,
  ) {
    this.assertCustomer(user);
    return this.applicationsService.submit(
      user,
      id,
      (body as { expectedVersion: number }).expectedVersion,
    );
  }

  @Get("loans/:id")
  loan(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    this.assertCustomer(user);
    return this.loansService.getForCustomer(user.id, id);
  }

  @Get("receipts/:id")
  receipt(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    this.assertCustomer(user);
    return this.moneyService.getReceiptForCustomer(user.id, id);
  }

  private assertCustomer(user: AuthUser) {
    if (user.isStaff) {
      throw forbidden();
    }
    if (!user.emailVerified) {
      throw forbidden("Verify your email to continue");
    }
  }
}
