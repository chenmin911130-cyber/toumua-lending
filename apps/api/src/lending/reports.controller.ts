import { Controller, Get, Inject } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RequireStaff } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthUser } from "../auth/session";
import { assertReadBusinessStatus } from "./access";
import { ReportsService } from "./reports.service";

@ApiTags("reports")
@RequireStaff()
@Controller("reports")
export class ReportsController {
  constructor(@Inject(ReportsService) private readonly reports: ReportsService) {}

  @Get("business-status")
  businessStatus(@CurrentUser() user: AuthUser) {
    assertReadBusinessStatus(user);
    return this.reports.businessStatus();
  }
}
