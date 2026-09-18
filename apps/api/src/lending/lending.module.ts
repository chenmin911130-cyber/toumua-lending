import { Module } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { ApplicationsController } from "./applications.controller";
import { ApplicationsService } from "./applications.service";
import { AssetsController } from "./assets.controller";
import { BorrowersController } from "./borrowers.controller";
import { BorrowersService } from "./borrowers.service";
import { CorrectionsController } from "./corrections.controller";
import { CorrectionsService } from "./corrections.service";
import { CustodyService } from "./custody.service";
import { DecisionsController } from "./decisions.controller";
import { DecisionsService } from "./decisions.service";
import { LoansController } from "./loans.controller";
import { LoansService } from "./loans.service";
import { MoneyService } from "./money.service";
import { NumbersService } from "./numbers.service";
import { TransactionsController } from "./transactions.controller";
import { UploadsController } from "./uploads.controller";
import { UploadsService } from "./uploads.service";
import { ValuationsController } from "./valuations.controller";
import { ValuationsService } from "./valuations.service";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [NotificationsModule],
  controllers: [
    BorrowersController,
    ApplicationsController,
    DecisionsController,
    ValuationsController,
    UploadsController,
    LoansController,
    AssetsController,
    TransactionsController,
    CorrectionsController,
  ],
  providers: [
    NumbersService,
    BorrowersService,
    ApplicationsService,
    DecisionsService,
    ValuationsService,
    UploadsService,
    LoansService,
    CustodyService,
    MoneyService,
    CorrectionsService,
    AuditService,
  ],
  exports: [ApplicationsService, BorrowersService, LoansService, MoneyService],
})
export class LendingModule {}
