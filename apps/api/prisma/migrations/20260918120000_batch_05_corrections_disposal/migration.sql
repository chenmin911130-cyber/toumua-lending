-- Batch 05: corrections workflow, sale receipt attempts, collateral sale drafts

ALTER TYPE "PaymentAttemptType" ADD VALUE IF NOT EXISTS 'SALE_RECEIPT';

CREATE TYPE "CorrectionStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'POSTED');

ALTER TABLE "ApplicationAsset" ADD COLUMN IF NOT EXISTS "saleDraft" JSONB;

CREATE TABLE "CorrectionRequest" (
    "id" TEXT NOT NULL,
    "originalLedgerEntryId" TEXT NOT NULL,
    "proposedValues" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "CorrectionStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedById" TEXT NOT NULL,
    "decidedById" TEXT,
    "decisionReason" TEXT,
    "reversalEntryId" TEXT,
    "replacementEntryId" TEXT,
    "postingKey" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CorrectionRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CorrectionRequest_reversalEntryId_key" ON "CorrectionRequest"("reversalEntryId");
CREATE UNIQUE INDEX "CorrectionRequest_replacementEntryId_key" ON "CorrectionRequest"("replacementEntryId");
CREATE UNIQUE INDEX "CorrectionRequest_postingKey_key" ON "CorrectionRequest"("postingKey");
CREATE INDEX "CorrectionRequest_status_createdAt_idx" ON "CorrectionRequest"("status", "createdAt");
CREATE INDEX "CorrectionRequest_originalLedgerEntryId_idx" ON "CorrectionRequest"("originalLedgerEntryId");

ALTER TABLE "CorrectionRequest" ADD CONSTRAINT "CorrectionRequest_originalLedgerEntryId_fkey" FOREIGN KEY ("originalLedgerEntryId") REFERENCES "LedgerEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CorrectionRequest" ADD CONSTRAINT "CorrectionRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CorrectionRequest" ADD CONSTRAINT "CorrectionRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
