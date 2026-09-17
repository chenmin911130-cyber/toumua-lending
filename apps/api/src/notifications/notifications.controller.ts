import { Controller, Get, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { emptyList } from "@toumua/contracts";
import { notFound } from "../common/http";

@ApiTags("notifications")
@Controller("notifications")
export class NotificationsController {
  @Get()
  list() {
    return { ...emptyList(), unread: 0 };
  }

  @Post(":id/read")
  read(@Param("id") _id: string) {
    throw notFound();
  }

  @Post("read-all")
  readAll() {
    return { unread: 0 };
  }
}
