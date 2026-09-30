import { Controller, Get, Inject, Param, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthUser } from "../auth/session";
import { DocumentsService } from "./documents.service";

@ApiTags("documents")
@Controller("documents")
export class DocumentsDownloadController {
  constructor(@Inject(DocumentsService) private readonly documents: DocumentsService) {}

  @Get(":id/file")
  async file(@CurrentUser() user: AuthUser, @Param("id") id: string, @Res() res: Response) {
    const opened = await this.documents.open(user, id);
    res.setHeader("content-type", opened.mimeType);
    res.setHeader("content-disposition", `inline; filename="${opened.filename.replace(/"/g, "")}"`);
    res.setHeader("x-content-type-options", "nosniff");
    opened.stream.pipe(res);
  }
}
