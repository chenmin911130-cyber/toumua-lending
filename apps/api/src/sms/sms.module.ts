import { Module } from "@nestjs/common";
import { SmsController } from "./sms.controller";
import { SmsOutboxService } from "./sms-outbox.service";
import { SmsService } from "./sms.service";

@Module({
  controllers: [SmsController],
  providers: [SmsService, SmsOutboxService],
  exports: [SmsService],
})
export class SmsModule {}
