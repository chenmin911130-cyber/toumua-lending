import { Module } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { NotificationsModule } from "../notifications/notifications.module";
import { SmsModule } from "../sms/sms.module";
import { RemindersController } from "./reminders.controller";
import { RemindersService } from "./reminders.service";

@Module({
  imports: [SmsModule, NotificationsModule],
  controllers: [RemindersController],
  providers: [RemindersService, AuditService],
  exports: [RemindersService],
})
export class RemindersModule {}
