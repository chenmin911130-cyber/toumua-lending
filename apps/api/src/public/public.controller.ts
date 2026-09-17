import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Public } from "../auth/auth.guard";

@ApiTags("public")
@Controller()
export class PublicController {

  @Public()
  @Get("health")
  health() {
    return { status: "ok", service: "toumua-api" };
  }

  @Public()
  @Get("public/contact")
  contact() {
    const value = (key: string) => {
      const raw = process.env[key]?.trim();
      return raw ? raw : null;
    };
    return {
      phone: value("CONTACT_PHONE"),
      email: value("CONTACT_EMAIL"),
      address: value("CONTACT_ADDRESS"),
      hours: value("CONTACT_HOURS"),
      note: value("CONTACT_NOTE"),
    };
  }
}
