import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  cursorListQuerySchema,
  defaultSchema,
  disbursementSchema,
  quoteQuerySchema,
  repaymentSchema,
  saleReceiptSchema,
} from "@toumua/contracts";
import { RequireStaff } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthUser } from "../auth/session";
import { validation } from "../common/http";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { LoansService } from "./loans.service";
import { MoneyService } from "./money.service";

@ApiTags("loans")
@RequireStaff()
@Controller("loans")
export class LoansController {
  constructor(
    @Inject(LoansService) private readonly loansService: LoansService,
    @Inject(MoneyService) private readonly moneyService: MoneyService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(cursorListQuerySchema)) query: unknown,
  ) {
    return this.loansService.list(user, query as never);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.loansService.get(user, id);
  }

  @Get(":id/quotes")
  quote(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Query(new ZodValidationPipe(quoteQuerySchema)) query: unknown,
  ) {
    return this.loansService.quote(user, id, query as never);
  }

  @Get(":id/disbursement-readiness")
  readiness(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.loansService.disbursementReadiness(user, id);
  }

  @Post(":id/disbursements")
  disburse(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(disbursementSchema)) body: unknown,
  ) {
    if (!idempotencyKey?.trim()) throw validation("Idempotency-Key header is required");
    return this.moneyService.disburse(user, id, body as never, idempotencyKey.trim());
  }

  @Post(":id/repayments")
  repay(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(repaymentSchema)) body: unknown,
  ) {
    if (!idempotencyKey?.trim()) throw validation("Idempotency-Key header is required");
    return this.moneyService.repay(user, id, body as never, idempotencyKey.trim());
  }

  @Post(":id/default")
  declareDefault(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(defaultSchema)) body: unknown,
  ) {
    return this.loansService.declareDefault(user, id, body as never);
  }

  @Post(":id/sale-receipts")
  saleReceipt(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(saleReceiptSchema)) body: unknown,
  ) {
    if (!idempotencyKey?.trim()) throw validation("Idempotency-Key header is required");
    return this.moneyService.saleReceipt(user, id, body as never, idempotencyKey.trim());
  }
}
