import {
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { RequireStaff } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthUser } from "../auth/session";
import { UploadsService } from "./uploads.service";

@ApiTags("uploads")
@Controller()
export class UploadsController {
  constructor(@Inject(UploadsService) private readonly uploads: UploadsService) {}

  @RequireStaff()
  @Post("applications/:applicationId/assets/:assetId/photos")
  @UseInterceptors(FileInterceptor("file"))
  upload(
    @CurrentUser() user: AuthUser,
    @Param("applicationId") applicationId: string,
    @Param("assetId") assetId: string,
    @UploadedFile() file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
  ) {
    return this.uploads.addPhoto(user, applicationId, assetId, file);
  }

  @RequireStaff()
  @Delete("applications/:applicationId/assets/:assetId/photos/:photoId")
  deletePhoto(
    @CurrentUser() user: AuthUser,
    @Param("applicationId") applicationId: string,
    @Param("assetId") assetId: string,
    @Param("photoId") photoId: string,
  ) {
    return this.uploads.deletePhoto(user, applicationId, assetId, photoId);
  }

  @Get("photos/:photoId/file")
  async file(
    @CurrentUser() user: AuthUser,
    @Param("photoId") photoId: string,
    @Res() res: Response,
  ) {
    const opened = await this.uploads.openPhoto(user, photoId);
    res.setHeader("content-type", opened.mimeType);
    res.setHeader("content-disposition", `inline; filename="${opened.filename}"`);
    opened.stream.pipe(res);
  }
}
