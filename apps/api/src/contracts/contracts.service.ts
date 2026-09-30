import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "../generated/prisma";
import { LEGAL_ENTITY } from "@toumua/contracts";
import { AuditService } from "../audit/audit.service";
import { AuthUser } from "../auth/session";
import { conflict, notFound, validation } from "../common/http";
import { PrismaService } from "../prisma/prisma.service";
import { DocumentsService, sniffDocument } from "../documents/documents.service";
import { assertManageLending, assertReissueContract, assertReadLedger } from "../lending/access";
import { activePolicy, DEMO_POLICY, demoAnnualRateBps } from "../lending/calculation-policy";
import { NumbersService } from "../lending/numbers.service";
import { NotificationsService } from "../notifications/notifications.service";
import { renderContract, renderSignedContract, sha256Text } from "./contract-template";

const MAX_SIGNATURE_BYTES = 200 * 1024;

type SignMeta = { ip: string | null; userAgent: string | null };

type SignBody = {
  typedName: string;
  signaturePng: string;
  contentSha256: string;
};

@Injectable()
export class ContractsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(NumbersService) private readonly numbers: NumbersService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(DocumentsService) private readonly documents: DocumentsService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  async issue(tx: Prisma.TransactionClient, loanId: string, user: AuthUser, version = 1, reason?: string) {
    const loan = await tx.loan.findUniqueOrThrow({
      where: { id: loanId },
      include: {
        borrower: true,
        schedule: { orderBy: { number: "asc" } },
        application: {
          include: {
            assets: {
              orderBy: { sortOrder: "asc" },
              include: {
                valuations: { where: { status: "COMPLETED" }, orderBy: { version: "desc" }, take: 1 },
              },
            },
          },
        },
      },
    });
    const number = await this.numbers.nextContractNumber(tx);
    const issuedAt = new Date();
    const borrowerName = loan.borrower.name;
    const bodyHtml = renderContract({
      number,
      issuedAt,
      borrowerName,
      borrowerNumber: loan.borrower.number,
      borrowerAddress: loan.borrower.address,
      principal: loan.principal,
      annualRateBps: loan.annualRateBps ?? (activePolicy() === DEMO_POLICY ? demoAnnualRateBps() : 0),
      frequency: loan.frequency,
      periods: loan.periods,
      schedule: loan.schedule.map((entry) => ({
        number: entry.number,
        dueDate: entry.dueDate,
        amount: entry.amount,
      })),
      assets: loan.application.assets.map((asset) => ({
        name: asset.name,
        identifier: asset.identifier,
        valuationAmount: asset.valuations[0]?.amount ?? null,
      })),
    });
    const contentSha256 = sha256Text(bodyHtml);
    const row = await tx.loanContract.create({
      data: {
        number,
        loanId,
        version,
        status: "ISSUED",
        bodyHtml,
        contentSha256,
        borrowerName,
        issuedAt,
      },
    });
    await this.audit.write(
      {
        actorId: user.id,
        action: "contract.issue",
        objectType: "LoanContract",
        objectId: row.id,
        reason: reason ?? null,
        after: { number, loanId, version, contentSha256, lender: LEGAL_ENTITY },
      },
      tx,
    );
    return row;
  }

  async currentForLoan(loanId: string) {
    return this.prisma.loanContract.findFirst({
      where: { loanId },
      orderBy: { version: "desc" },
    });
  }

  summary(row: {
    id: string;
    loanId: string;
    number: string;
    version: number;
    status: string;
    issuedAt: Date;
    signedAt: Date | null;
    signerName: string | null;
    signerMethod: string | null;
    contentSha256: string;
    signedDocId: string | null;
  }) {
    return {
      id: row.id,
      loanId: row.loanId,
      number: row.number,
      version: row.version,
      status: row.status as "ISSUED" | "SIGNED" | "VOID",
      issuedAt: row.issuedAt.toISOString(),
      signedAt: row.signedAt?.toISOString() ?? null,
      signerName: row.signerName,
      signerMethod: row.signerMethod,
      contentSha256: row.contentSha256,
      signedDocId: row.signedDocId,
    };
  }

  async getForStaff(user: AuthUser, id: string) {
    assertReadLedger(user);
    const row = await this.prisma.loanContract.findUnique({ where: { id } });
    if (!row) throw notFound("Contract not found");
    return { ...this.summary(row), bodyHtml: row.bodyHtml };
  }

  async getForCustomer(userId: string, id: string) {
    const row = await this.ownedByCustomer(userId, id);
    return { ...this.summary(row), bodyHtml: row.bodyHtml };
  }

  async signPortal(user: AuthUser, id: string, input: SignBody & { consent: true }, meta: SignMeta) {
    const owned = await this.ownedByCustomer(user.id, id);
    return this.executeSignature({
      contractId: owned.id,
      typedName: input.typedName,
      signaturePng: input.signaturePng,
      contentSha256: input.contentSha256,
      method: "PORTAL",
      signerRole: "BORROWER",
      actorId: user.id,
      witnessId: null,
      witnessName: null,
      meta,
    });
  }

  async signInBranch(user: AuthUser, id: string, input: SignBody & { borrowerPresent: true }, meta: SignMeta) {
    assertManageLending(user);
    const row = await this.prisma.loanContract.findUnique({ where: { id }, select: { id: true } });
    if (!row) throw notFound("Contract not found");
    return this.executeSignature({
      contractId: id,
      typedName: input.typedName,
      signaturePng: input.signaturePng,
      contentSha256: input.contentSha256,
      method: "IN_BRANCH",
      signerRole: "BORROWER",
      actorId: user.id,
      witnessId: user.id,
      witnessName: user.name,
      meta,
    });
  }

  async reissue(user: AuthUser, loanId: string, reason: string, contractId?: string) {
    assertReissueContract(user);
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        // NO KEY UPDATE serialises two issues without blocking the key share a signature's document insert takes on the loan.
        await tx.$queryRaw`SELECT id FROM "Loan" WHERE id = ${loanId} FOR NO KEY UPDATE`;
        const loan = await tx.loan.findUnique({ where: { id: loanId }, select: { id: true, status: true } });
        if (!loan) throw notFound("Loan not found");
        if (loan.status !== "APPROVED_UNFUNDED") {
          throw conflict("A contract can only be reissued before the loan is disbursed");
        }
        const current = await tx.loanContract.findFirst({
          where: { loanId },
          orderBy: { version: "desc" },
        });
        if (!current) {
          if (contractId) throw conflict("A contract was already issued");
          return this.issue(tx, loanId, user, 1, reason);
        }
        if (!contractId || contractId !== current.id) {
          throw conflict("A contract was already issued");
        }
        await tx.$queryRaw`SELECT id FROM "LoanContract" WHERE id = ${current.id} FOR UPDATE`;
        const locked = await tx.loanContract.findUniqueOrThrow({ where: { id: current.id } });
        if (locked.status === "SIGNED") throw conflict("A signed contract cannot be reissued");
        if (locked.status !== "ISSUED") throw conflict("This contract has been superseded and cannot be signed");
        await tx.loanContract.update({
          where: { id: locked.id },
          data: { status: "VOID", voidedAt: new Date(), voidReason: reason },
        });
        await this.audit.write(
          {
            actorId: user.id,
            action: "contract.void",
            objectType: "LoanContract",
            objectId: locked.id,
            reason,
            after: { status: "VOID", version: locked.version },
          },
          tx,
        );
        return this.issue(tx, loanId, user, locked.version + 1, reason);
      });
      return this.summary(created);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw conflict("A contract was already issued");
      }
      throw error;
    }
  }

  private async executeSignature(input: {
    contractId: string;
    typedName: string;
    signaturePng: string;
    contentSha256: string;
    method: "PORTAL" | "IN_BRANCH";
    signerRole: "BORROWER";
    actorId: string;
    witnessId: string | null;
    witnessName: string | null;
    meta: SignMeta;
  }) {
    const signature = decodeSignaturePng(input.signaturePng);
    const signedAt = new Date();
    // Raising the HTTP error inside the transaction has dropped the connection, and a retry then signs nothing.
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "LoanContract" WHERE id = ${input.contractId} FOR UPDATE`;
      const contract = await tx.loanContract.findUnique({
        where: { id: input.contractId },
        include: { loan: { include: { borrower: true } } },
      });
      if (!contract) return { lost: "missing" as const };
      if (contract.status === "SIGNED") return { lost: "signed" as const };
      if (contract.status !== "ISSUED") return { lost: "void" as const };
      if (contract.contentSha256.toLowerCase() !== input.contentSha256.toLowerCase()) {
        return { lost: "hash" as const };
      }
      const expectedName = contract.borrowerName ?? contract.loan.borrower.name;
      if (input.typedName.trim().toLowerCase() !== expectedName.trim().toLowerCase()) {
        return { lost: "name" as const };
      }
      const signatureDoc = await this.documents.store(
        {
          kind: "SIGNATURE_IMAGE",
          buffer: signature,
          filename: "signature.png",
          mimeType: "image/png",
          borrowerId: contract.loan.borrowerId,
          loanId: contract.loanId,
          userId: input.actorId,
        },
        tx,
        input.actorId,
      );
      const signedHtml = renderSignedContract(contract.bodyHtml, {
        signerName: input.typedName.trim(),
        signerRole: input.signerRole,
        signerMethod: input.method,
        signedAt,
        ip: input.meta.ip,
        userAgent: input.meta.userAgent,
        contentSha256: contract.contentSha256,
        signaturePngDataUrl: `data:image/png;base64,${signature.toString("base64")}`,
        witnessName: input.witnessName,
      });
      const signedDoc = await this.documents.store(
        {
          kind: "LOAN_CONTRACT_SIGNED",
          buffer: Buffer.from(signedHtml, "utf8"),
          filename: `${contract.number}.html`,
          mimeType: "text/html",
          generatedHtml: true,
          borrowerId: contract.loan.borrowerId,
          loanId: contract.loanId,
          userId: input.actorId,
        },
        tx,
        input.actorId,
      );
      const updated = await tx.loanContract.updateMany({
        where: { id: contract.id, status: "ISSUED" },
        data: {
          status: "SIGNED",
          signedAt,
          signerName: input.typedName.trim(),
          signerMethod: input.method,
          signerIp: input.meta.ip,
          signerUserAgent: input.meta.userAgent,
          signatureDocId: signatureDoc.id,
          signedDocId: signedDoc.id,
          witnessedById: input.witnessId,
        },
      });
      if (updated.count !== 1) return { lost: "signed" as const };
      await this.audit.write(
        {
          actorId: input.actorId,
          action: "contract.sign",
          objectType: "LoanContract",
          objectId: contract.id,
          after: {
            role: input.signerRole,
            method: input.method,
            signerName: input.typedName.trim(),
            contentSha256: contract.contentSha256,
            witnessId: input.witnessId,
            signedAt: signedAt.toISOString(),
          },
        },
        tx,
      );
      return { contract, signedDocId: signedDoc.id };
    });
    if ("lost" in result) {
      if (result.lost === "missing") throw notFound("Contract not found");
      if (result.lost === "signed") throw conflict("This contract is already signed");
      if (result.lost === "void") throw conflict("This contract has been superseded and cannot be signed");
      if (result.lost === "hash") throw conflict("This contract has changed. Reload and review it again.");
      throw validation("Type your full name as shown on the contract", {
        typedName: ["Type your full name as shown on the contract"],
      });
    }
    try {
      await this.notifications.notifyLendingStaff(
        "Loan contract signed",
        `${result.contract.number} was signed.`,
        `/staff/loans/${result.contract.loanId}`,
      );
    } catch {
      // The signed contract stands even if the staff notice cannot be written.
    }
    const saved = await this.prisma.loanContract.findUniqueOrThrow({ where: { id: input.contractId } });
    return { ...this.summary(saved), signedDocId: result.signedDocId };
  }

  private async ownedByCustomer(userId: string, id: string) {
    const link = await this.prisma.borrowerAccountLink.findFirst({
      where: { userId, status: "ACTIVE" },
      select: { borrowerId: true },
    });
    if (!link) throw notFound("Contract not found");
    const row = await this.prisma.loanContract.findFirst({
      where: { id, loan: { borrowerId: link.borrowerId } },
    });
    if (!row) throw notFound("Contract not found");
    return row;
  }
}

export function decodeSignaturePng(dataUrl: string): Buffer {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl.trim());
  if (!match) throw validation("The signature must be a PNG image");
  const buffer = Buffer.from(match[1].replace(/\s/g, ""), "base64");
  if (buffer.length === 0 || buffer.length > MAX_SIGNATURE_BYTES) {
    throw validation("The signature image must be 200 KB or smaller");
  }
  if (sniffDocument(buffer) !== "image/png") throw validation("The signature must be a PNG image");
  return buffer;
}
