-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('LOAN_CONTRACT_SIGNED', 'SIGNATURE_IMAGE', 'BORROWER_ID', 'OTHER');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('ISSUED', 'SIGNED', 'VOID');

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "kind" "DocumentKind" NOT NULL,
    "borrowerId" TEXT,
    "loanId" TEXT,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoanContract" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "ContractStatus" NOT NULL DEFAULT 'ISSUED',
    "bodyHtml" TEXT NOT NULL,
    "contentSha256" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signedAt" TIMESTAMP(3),
    "signerName" TEXT,
    "signerMethod" TEXT,
    "signerIp" TEXT,
    "signerUserAgent" TEXT,
    "signatureDocId" TEXT,
    "signedDocId" TEXT,
    "witnessedById" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,

    CONSTRAINT "LoanContract_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Document_storageKey_key" ON "Document"("storageKey");

-- CreateIndex
CREATE INDEX "Document_borrowerId_idx" ON "Document"("borrowerId");

-- CreateIndex
CREATE INDEX "Document_loanId_idx" ON "Document"("loanId");

-- CreateIndex
CREATE UNIQUE INDEX "LoanContract_number_key" ON "LoanContract"("number");

-- CreateIndex
CREATE UNIQUE INDEX "LoanContract_signatureDocId_key" ON "LoanContract"("signatureDocId");

-- CreateIndex
CREATE UNIQUE INDEX "LoanContract_signedDocId_key" ON "LoanContract"("signedDocId");

-- CreateIndex
CREATE INDEX "LoanContract_loanId_status_idx" ON "LoanContract"("loanId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "LoanContract_loanId_version_key" ON "LoanContract"("loanId", "version");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_borrowerId_fkey" FOREIGN KEY ("borrowerId") REFERENCES "Borrower"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanContract" ADD CONSTRAINT "LoanContract_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanContract" ADD CONSTRAINT "LoanContract_signatureDocId_fkey" FOREIGN KEY ("signatureDocId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanContract" ADD CONSTRAINT "LoanContract_signedDocId_fkey" FOREIGN KEY ("signedDocId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanContract" ADD CONSTRAINT "LoanContract_witnessedById_fkey" FOREIGN KEY ("witnessedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
