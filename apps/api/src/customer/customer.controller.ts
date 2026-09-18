import { Controller, Get, Inject, Param } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthUser } from "../auth/session";
import { forbidden } from "../common/http";
import { ApplicationsService } from "../lending/applications.service";
import { LoansService } from "../lending/loans.service";
import { MoneyService } from "../lending/money.service";

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

  @Get("applications")
  applications(@CurrentUser() user: AuthUser) {
    this.assertCustomer(user);
    return this.applicationsService.listForCustomer(user.id);
  }

  @Get("applications/:id")
  application(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    this.assertCustomer(user);
    return this.applicationsService.getForCustomer(user.id, id);
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
