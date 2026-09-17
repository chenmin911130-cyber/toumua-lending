import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { MailService } from "../mail/mail.service";
import { AuditService } from "../audit/audit.service";
import { RateLimitService } from "../common/rate-limit.service";
import { SessionMiddleware } from "./session.middleware";

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    MailService,
    AuditService,
    RateLimitService,
    SessionMiddleware,
  ],
  exports: [AuthService, MailService, AuditService, RateLimitService, SessionMiddleware],
})
export class AuthModule {}
