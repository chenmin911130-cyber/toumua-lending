import { Controller, Get, Inject, Param, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RequireStaff } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthUser } from "../auth/session";
import { MoneyService } from "./money.service";

@ApiTags("transactions")
@RequireStaff()
@Controller()
export class TransactionsController {
  constructor(@Inject(MoneyService) private readonly moneyService: MoneyService) {}

  @Get("transactions")
  list(
    @CurrentUser() user: AuthUser,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    return this.moneyService.listTransactions(user, {
      cursor,
      limit: limit ? Number.parseInt(limit, 10) : undefined,
    });
  }

  @Get("transactions/:id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.moneyService.getTransaction(user, id);
  }

  /**
   * S13-01 opens the receipt drawer from a transaction row; the money service
   * already builds this view, it simply had no route.
   */
  @Get("receipts/:id")
  receipt(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.moneyService.getReceipt(user, id);
  }

  @Get("payment-attempts")
  listAttempts(
    @CurrentUser() user: AuthUser,
    @Query("status") status?: string,
    @Query("mine") mine?: string,
  ) {
    if (status === "unresolved") {
      return this.moneyService.listUnresolvedAttempts(user, mine === "true");
    }
    return { items: [] };
  }

  @Get("payment-attempts/:id")
  attempt(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.moneyService.getPaymentAttempt(user, id);
  }
}
