import { Inject, Injectable } from "@nestjs/common";
import { createReadStream, existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { AuthUser } from "../auth/session";
import { forbidden, notFound } from "../common/http";
import { PrismaService } from "../prisma/prisma.service";
import { assertManageLending } from "./access";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 8 * 1024 * 1024;

@Injectable()
export class UploadsService {
  private readonly uploadDir: string;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    this.uploadDir =
      process.env.UPLOAD_DIR ?? join(process.cwd(), "../../storage/uploads");
    if (!existsSync(this.uploadDir)) {
      mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async addPhoto(
    user: AuthUser,
    applicationId: string,
    assetId: string,
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
  ) {
    assertManageLending(user);
    const asset = await this.prisma.applicationAsset.findFirst({
      where: { id: assetId, applicationId },
      include: { application: true },
    });
    if (!asset) throw notFound("Asset not found");
    if (asset.application.status !== "DRAFT") {
      throw forbidden("Only draft applications can be edited");
    }
    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw forbidden("Only JPEG, PNG, or WebP images are allowed");
    }
    if (file.size > MAX_BYTES) {
      throw forbidden("Image must be 8 MB or smaller");
    }
    const storageKey = `${randomUUID()}-${file.originalname.replace(/[^\w.-]+/g, "_")}`;
    writeFileSync(join(this.uploadDir, storageKey), file.buffer);
    const photo = await this.prisma.assetPhoto.create({
      data: {
        assetId,
        filename: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storageKey,
      },
    });
    await this.prisma.application.update({
      where: { id: applicationId },
      data: { version: { increment: 1 } },
    });
    return {
      id: photo.id,
      filename: photo.filename,
      mimeType: photo.mimeType,
      sizeBytes: photo.sizeBytes,
      url: `/api/v1/photos/${photo.id}/file`,
    };
  }

  async deletePhoto(user: AuthUser, applicationId: string, assetId: string, photoId: string) {
    assertManageLending(user);
    const photo = await this.prisma.assetPhoto.findFirst({
      where: { id: photoId, assetId, asset: { applicationId } },
      include: { asset: { include: { application: true } } },
    });
    if (!photo) throw notFound("Photo not found");
    if (photo.asset.application.status !== "DRAFT") {
      throw forbidden("Only draft applications can be edited");
    }
    this.removeFile(photo.storageKey);
    await this.prisma.assetPhoto.delete({ where: { id: photoId } });
    await this.prisma.application.update({
      where: { id: applicationId },
      data: { version: { increment: 1 } },
    });
    return { ok: true };
  }

  async openPhoto(user: AuthUser, photoId: string) {
    const photo = await this.prisma.assetPhoto.findUnique({
      where: { id: photoId },
      include: { asset: { include: { application: true } } },
    });
    if (!photo) throw notFound("Photo not found");
    if (!user.isStaff) {
      const link = await this.prisma.borrowerAccountLink.findFirst({
        where: { userId: user.id, status: "ACTIVE" },
      });
      if (
        !link ||
        link.borrowerId !== photo.asset.application.borrowerId ||
        photo.asset.application.status === "DRAFT"
      ) {
        throw forbidden();
      }
    }
    const path = join(this.uploadDir, photo.storageKey);
    if (!existsSync(path)) throw notFound("File not found");
    return { stream: createReadStream(path), mimeType: photo.mimeType, filename: photo.filename };
  }

  private removeFile(storageKey: string) {
    const path = join(this.uploadDir, storageKey);
    if (existsSync(path)) unlinkSync(path);
  }
}
