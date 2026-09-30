import { Module } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { DocumentsModule } from "../documents/documents.module";
import { NumbersService } from "../lending/numbers.service";
import { NotificationsModule } from "../notifications/notifications.module";
import { ContractsController } from "./contracts.controller";
import { ContractsService } from "./contracts.service";

@Module({
  imports: [DocumentsModule, NotificationsModule],
  controllers: [ContractsController],
  providers: [ContractsService, NumbersService, AuditService],
  exports: [ContractsService],
})
export class ContractsModule {}
