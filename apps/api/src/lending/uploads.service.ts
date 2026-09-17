import { Inject, Injectable } from "@nestjs/common";
import { createReadStream, existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { AuthUser } from "../auth/session";
import { forbidden, notFound } from "../common/http";
import { PrismaService } from "../prisma/prisma.service";
import { assertManageLending } from "./access";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_PHOTOS_PER_ASSET = 10;

/**
 * Confirms the bytes really are a JPEG, PNG, or WebP image. The declared
 * content type is attacker-controlled, so it is only used as a cross-check.
 */
function sniffImageMime(buffer: Buffer): string | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "image/png";
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

@Injectable()
export class UploadsService {
  private readonly uploadDir: string;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    // UPLOAD_DIR is set explicitly by the test helpers; the fallback resolves to
    // the repository's storage/uploads, which stays out of version control.
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
      throw forbidden("Image must be 10 MB or smaller");
    }
    const actualMime = sniffImageMime(file.buffer);
    if (!actualMime) {
      throw forbidden("The uploaded file is not a readable JPEG, PNG, or WebP image");
    }
    const photoCount = await this.prisma.assetPhoto.count({ where: { assetId } });
    if (photoCount >= MAX_PHOTOS_PER_ASSET) {
      throw forbidden(`Each asset can hold at most ${MAX_PHOTOS_PER_ASSET} photos`);
    }
    const storageKey = `${randomUUID()}-${file.originalname.replace(/[^\w.-]+/g, "_")}`;
    writeFileSync(join(this.uploadDir, storageKey), file.buffer);
    const photo = await this.prisma.assetPhoto.create({
      data: {
        assetId,
        filename: file.originalname,
        mimeType: actualMime,
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

  /**
   * Removes the stored files for an asset whose row is being deleted. Call this
   * with the keys read before the delete, because the photo rows cascade away.
   */
  removeFilesForAsset(storageKeys: string[]) {
    for (const key of storageKeys) {
      this.removeFile(key);
    }
  }

  private removeFile(storageKey: string) {
    const path = join(this.uploadDir, storageKey);
    if (existsSync(path)) unlinkSync(path);
  }
}
