import { Body, Controller, HttpCode, Inject, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { runRemindersSchema } from "@toumua/contracts";
import { RequireStaff } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthUser } from "../auth/session";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { assertRunReminders } from "../lending/access";
import { RemindersService } from "./reminders.service";

@ApiTags("reminders")
@RequireStaff()
@Controller("reminders")
export class RemindersController {
  constructor(@Inject(RemindersService) private readonly reminders: RemindersService) {}

  @Post("run")
  @HttpCode(200)
  run(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(runRemindersSchema)) body: { asOf?: string },
  ) {
    assertRunReminders(user);
    const asOf = body.asOf ? new Date(`${body.asOf}T00:00:00.000Z`) : new Date();
    return this.reminders.runDue(asOf, user.id);
  }
}
