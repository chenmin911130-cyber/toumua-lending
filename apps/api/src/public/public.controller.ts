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
    const value = (key: string, fallback: string) => {
      const raw = process.env[key]?.trim();
      return raw ? raw : fallback;
    };
    return {
      phone: value("CONTACT_PHONE", "021 150 1502"),
      email: value("CONTACT_EMAIL", "office@toumua.nz"),
      address: value("CONTACT_ADDRESS", "Auckland, New Zealand"),
      hours: value("CONTACT_HOURS", "Monday–Friday, 9:00am–5:00pm NZST"),
      note: value(
        "CONTACT_NOTE",
        "Demo office mailbox for the COMP721 Toumu’a Lending workspace.",
      ),
    };
  }
}
