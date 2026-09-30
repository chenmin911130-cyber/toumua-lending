import { Module } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { LendingModule } from "../lending/lending.module";
import { ArrangementsController } from "./arrangements.controller";
import { ArrangementsService } from "./arrangements.service";
import { CollectionsService } from "./collections.service";

@Module({
  imports: [LendingModule],
  controllers: [ArrangementsController],
  providers: [ArrangementsService, CollectionsService, AuditService],
  exports: [ArrangementsService],
})
export class ArrangementsModule {}
