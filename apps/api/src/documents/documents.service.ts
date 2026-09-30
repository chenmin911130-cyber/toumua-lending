import { createHash, randomUUID } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "../generated/prisma";
import { AuditService } from "../audit/audit.service";
import { AuthUser } from "../auth/session";
import { conflict, notFound, validation } from "../common/http";
import { PrismaService } from "../prisma/prisma.service";
import { assertDeleteDocument, assertManageLending, assertReadLedger } from "../lending/access";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set(["application/pdf", "image/png", "image/jpeg"]);

type StoreClient = Prisma.TransactionClient | PrismaService;

export type StoredDocumentInput = {
  kind: "LOAN_CONTRACT_SIGNED" | "SIGNATURE_IMAGE" | "BORROWER_ID" | "OTHER";
  buffer: Buffer;
  filename: string;
  mimeType: string;
  borrowerId?: string | null;
  loanId?: string | null;
  userId?: string | null;
  /** Server-rendered HTML. Not accepted from the upload endpoint. */
  generatedHtml?: boolean;
};

@Injectable()
export class DocumentsService {
  private readonly dir: string;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {
    const uploadDir = process.env.UPLOAD_DIR ?? join(process.cwd(), "../../storage/uploads");
    this.dir = process.env.DOCUMENT_DIR ?? join(uploadDir, "documents");
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
  }

  async store(input: StoredDocumentInput, client: StoreClient = this.prisma, actorId?: string | null) {
    if (input.buffer.length > MAX_BYTES) {
      throw validation("File must be 10 MB or smaller");
    }
    let mimeType = input.mimeType;
    if (input.generatedHtml) {
      if (mimeType !== "text/html") throw validation("Generated contracts are stored as HTML");
    } else {
      const sniffed = sniffDocument(input.buffer);
      if (!sniffed || sniffed !== input.mimeType || !ALLOWED.has(sniffed)) {
        throw validation("Only PDF, PNG, or JPEG files are allowed");
      }
      mimeType = sniffed;
    }
    const sha256 = createHash("sha256").update(input.buffer).digest("hex");
    if (input.borrowerId) {
      const borrower = await this.prisma.borrower.findUnique({
        where: { id: input.borrowerId },
        select: { id: true },
      });
      if (!borrower) throw notFound("Borrower not found");
    }
    const storageKey = randomUUID();
    const path = this.filePath(storageKey);
    writeFileSync(path, input.buffer);
    try {
      const row = await client.document.create({
        data: {
          kind: input.kind,
          borrowerId: input.borrowerId ?? null,
          loanId: input.loanId ?? null,
          filename: safeStoredName(input.filename, mimeType),
          mimeType,
          sizeBytes: input.buffer.length,
          sha256,
          storageKey,
          uploadedById: input.userId ?? null,
        },
      });
      await this.audit.write(
        {
          actorId: actorId ?? input.userId ?? null,
          action: "document.store",
          objectType: "Document",
          objectId: row.id,
          after: { kind: row.kind, sha256, loanId: row.loanId, borrowerId: row.borrowerId },
        },
        client,
      );
      return row;
    } catch (error) {
      try {
        unlinkSync(path);
      } catch {
        // The failed write should not leave a file, even if a second cleanup races it.
      }
      throw error;
    }
  }

  async open(user: AuthUser, id: string) {
    const row = await this.prisma.document.findUnique({ where: { id } });
    if (!row || row.deletedAt) throw notFound("Document not found");
    await this.assertCanRead(user, row.borrowerId, row.loanId);
    const bytes = readFileSync(this.filePath(row.storageKey));
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (sha256 !== row.sha256) {
      await this.audit.write({
        actorId: user.id,
        action: "document.integrity_failed",
        objectType: "Document",
        objectId: row.id,
        after: { expected: row.sha256, actual: sha256 },
      });
      throw conflict("Document integrity check failed");
    }
    await this.audit.write({
      actorId: user.id,
      action: "document.read",
      objectType: "Document",
      objectId: row.id,
      after: { sha256 },
    });
    return {
      mimeType: row.mimeType,
      filename: row.filename,
      stream: createReadStream(this.filePath(row.storageKey)),
    };
  }

  async listForBorrower(user: AuthUser, borrowerId: string) {
    assertManageLending(user);
    const borrower = await this.prisma.borrower.findUnique({ where: { id: borrowerId }, select: { id: true } });
    if (!borrower) throw notFound("Borrower not found");
    const items = await this.prisma.document.findMany({
      where: { borrowerId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
    return {
      items: items.map((row) => ({
        id: row.id,
        kind: row.kind,
        filename: row.filename,
        mimeType: row.mimeType,
        sizeBytes: row.sizeBytes,
        sha256: row.sha256,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  async remove(user: AuthUser, id: string) {
    assertDeleteDocument(user);
    const row = await this.prisma.document.findUnique({ where: { id } });
    if (!row || row.deletedAt) throw notFound("Document not found");
    const referenced = await this.prisma.loanContract.findFirst({
      where: { OR: [{ signatureDocId: id }, { signedDocId: id }] },
      select: { id: true },
    });
    if (referenced) throw conflict("This document belongs to a signed contract");
    const updated = await this.prisma.document.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.audit.write({
      actorId: user.id,
      action: "document.delete",
      objectType: "Document",
      objectId: id,
      after: { deletedAt: updated.deletedAt?.toISOString() ?? null },
    });
    return { id, deletedAt: updated.deletedAt?.toISOString() ?? null };
  }

  private filePath(storageKey: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(storageKey)) {
      throw notFound("Document not found");
    }
    return join(this.dir, storageKey);
  }

  private async assertCanRead(user: AuthUser, borrowerId: string | null, loanId: string | null) {
    if (user.isStaff) {
      assertReadLedger(user);
      return;
    }
    const link = await this.prisma.borrowerAccountLink.findFirst({
      where: { userId: user.id, status: "ACTIVE" },
      select: { borrowerId: true },
    });
    if (!link) throw notFound("Document not found");
    if (borrowerId && borrowerId === link.borrowerId) return;
    if (loanId) {
      const loan = await this.prisma.loan.findFirst({
        where: { id: loanId, borrowerId: link.borrowerId },
        select: { id: true },
      });
      if (loan) return;
    }
    throw notFound("Document not found");
  }
}

export function sniffDocument(buffer: Buffer): "application/pdf" | "image/png" | "image/jpeg" | null {
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "image/png";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  return null;
}

function safeStoredName(filename: string, mime: string) {
  const extension = mime === "application/pdf" ? "pdf" : mime === "image/png" ? "png" : mime === "text/html" ? "html" : "jpg";
  const base = filename.replace(/[^A-Za-z0-9._-]/g, "").slice(0, 40) || "document";
  return base.includes(".") ? base : `${base}.${extension}`;
}
