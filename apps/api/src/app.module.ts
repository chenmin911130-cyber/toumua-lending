import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { StaffModule } from "./staff/staff.module";
import { AuthGuard } from "./auth/auth.guard";
import { CsrfGuard } from "./auth/csrf.guard";
import { SessionMiddleware } from "./auth/session.middleware";
import { AuditController } from "./audit/audit.controller";
import { AuditService } from "./audit/audit.service";
import { CustomerController } from "./customer/customer.controller";
import { SearchController } from "./search/search.controller";
import { NotificationsModule } from "./notifications/notifications.module";
import { PublicController } from "./public/public.controller";
import { BootstrapService } from "./bootstrap/bootstrap.service";
import { LendingModule } from "./lending/lending.module";

/**
 * Tests run against a throwaway cluster whose configuration arrives entirely
 * through the environment. Module decorators are evaluated at import time, so
 * this is the earliest place that can stop `@nestjs/config` from opening the
 * developer's `../../.env` before a test guard has a chance to run. Outside
 * tests the local `.env` remains the expected configuration source.
 */
const isolateFromEnvFile =
  process.env.TOUMUA_ISOLATED_TEST === "1" || process.env.NODE_ENV === "test";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: isolateFromEnvFile,
      envFilePath: ["../../.env", ".env"],
    }),
    PrismaModule,
    AuthModule,
    StaffModule,
    LendingModule,
    NotificationsModule,
  ],
  controllers: [
    AuditController,
    CustomerController,
    SearchController,
    PublicController,
  ],
  providers: [
    AuditService,
    BootstrapService,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(SessionMiddleware).forRoutes("*");
  }
}
