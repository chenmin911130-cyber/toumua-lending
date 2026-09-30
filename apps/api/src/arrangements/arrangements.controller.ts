import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  arrangementCancelSchema,
  arrangementRequestSchema,
  collectionPostSchema,
} from "@toumua/contracts";
import { RequireStaff } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthUser } from "../auth/session";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { validation } from "../common/http";
import { aucklandDay } from "../common/dates";
import { ArrangementsService } from "./arrangements.service";
import { CollectionsService } from "./collections.service";

@ApiTags("arrangements")
@Controller()
export class ArrangementsController {
  constructor(
    @Inject(ArrangementsService) private readonly arrangements: ArrangementsService,
    @Inject(CollectionsService) private readonly collections: CollectionsService,
  ) {}

  @Post("me/loans/:loanId/arrangements")
  requestAsCustomer(
    @CurrentUser() user: AuthUser,
    @Param("loanId") loanId: string,
    @Body(new ZodValidationPipe(arrangementRequestSchema)) body: {
      method: "BANK_AUTOMATIC_PAYMENT" | "DIRECT_DEBIT";
      accountName: string;
      accountNumber: string;
      bankName?: string | null;
      consent: true;
    },
  ) {
    return this.arrangements.requestForCustomer(user, loanId, body);
  }

  @Post("me/loans/:loanId/arrangements/cancel")
  @HttpCode(200)
  cancelAsCustomer(
    @CurrentUser() user: AuthUser,
    @Param("loanId") loanId: string,
    @Body(new ZodValidationPipe(arrangementCancelSchema)) body: { reason: string },
  ) {
    return this.arrangements.cancelForCustomer(user, loanId, body.reason);
  }

  @Post("loans/:loanId/arrangements")
  @RequireStaff()
  requestAsStaff(
    @CurrentUser() user: AuthUser,
    @Param("loanId") loanId: string,
    @Body(new ZodValidationPipe(arrangementRequestSchema)) body: {
      method: "BANK_AUTOMATIC_PAYMENT" | "DIRECT_DEBIT";
      accountName: string;
      accountNumber: string;
      bankName?: string | null;
      consent: true;
    },
  ) {
    return this.arrangements.requestForStaff(user, loanId, body);
  }

  @Post("arrangements/:id/activate")
  @RequireStaff()
  @HttpCode(200)
  activate(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.arrangements.activate(user, id);
  }

  @Post("arrangements/:id/cancel")
  @RequireStaff()
  @HttpCode(200)
  cancelAsStaff(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(arrangementCancelSchema)) body: { reason: string },
  ) {
    return this.arrangements.cancelForStaff(user, id, body.reason);
  }

  @Get("arrangements/collections")
  @RequireStaff()
  collectionsList(@CurrentUser() user: AuthUser, @Query("date") date?: string) {
    const day = date?.trim() || undefined;
    if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw validation("Date must be YYYY-MM-DD");
    return this.collections.list(user, day ?? aucklandDay());
  }

  @Post("arrangements/collections/:scheduleEntryId/post")
  @RequireStaff()
  @HttpCode(200)
  postCollection(
    @CurrentUser() user: AuthUser,
    @Param("scheduleEntryId") scheduleEntryId: string,
    @Body(new ZodValidationPipe(collectionPostSchema)) body: {
      received: true;
      amount?: string;
      externalReference?: string | null;
    },
    @Query("date") date?: string,
  ) {
    const day = date?.trim();
    if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw validation("Date must be YYYY-MM-DD");
    return this.collections.post(user, scheduleEntryId, body, day);
  }
}
