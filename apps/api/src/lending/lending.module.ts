import { Module } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { ApplicationsController } from "./applications.controller";
import { ApplicationsService } from "./applications.service";
import { BorrowersController } from "./borrowers.controller";
import { BorrowersService } from "./borrowers.service";
import { NumbersService } from "./numbers.service";
import { UploadsController } from "./uploads.controller";
import { UploadsService } from "./uploads.service";
import { ValuationsController } from "./valuations.controller";
import { ValuationsService } from "./valuations.service";

@Module({
  controllers: [
    BorrowersController,
    ApplicationsController,
    ValuationsController,
    UploadsController,
  ],
  providers: [
    NumbersService,
    BorrowersService,
    ApplicationsService,
    ValuationsService,
    UploadsService,
    AuditService,
  ],
  exports: [ApplicationsService, BorrowersService],
})
export class LendingModule {}
