import { Module } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { BorrowerDocumentsController } from "./borrower-documents.controller";
import { DocumentsDownloadController } from "./documents.controller";
import { DocumentsService } from "./documents.service";

@Module({
  controllers: [DocumentsDownloadController, BorrowerDocumentsController],
  providers: [DocumentsService, AuditService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
