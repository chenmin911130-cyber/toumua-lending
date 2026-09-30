import {
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiTags } from "@nestjs/swagger";
import { RequireStaff } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthUser } from "../auth/session";
import { validation } from "../common/http";
import { assertManageLending } from "../lending/access";
import { DocumentsService } from "./documents.service";

@ApiTags("documents")
@RequireStaff()
@Controller()
export class BorrowerDocumentsController {
  constructor(@Inject(DocumentsService) private readonly documents: DocumentsService) {}

  @Get("borrowers/:id/documents")
  list(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.documents.listForBorrower(user, id);
  }

  @Post("borrowers/:id/documents")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  async upload(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @UploadedFile() file?: { originalname: string; mimetype: string; size: number; buffer: Buffer },
  ) {
    assertManageLending(user);
    if (!file?.buffer?.length) throw validation("Choose a file to upload");
    const row = await this.documents.store(
      {
        kind: "OTHER",
        buffer: file.buffer,
        filename: file.originalname || "document",
        mimeType: file.mimetype,
        borrowerId: id,
        userId: user.id,
      },
      undefined,
      user.id,
    );
    return {
      id: row.id,
      kind: row.kind,
      filename: row.filename,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      sha256: row.sha256,
      createdAt: row.createdAt.toISOString(),
    };
  }

  @Delete("documents/:id")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.documents.remove(user, id);
  }
}
