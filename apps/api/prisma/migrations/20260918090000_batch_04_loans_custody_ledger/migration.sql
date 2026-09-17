-- Batch 04: manager decision, loans, collateral custody, ledger and receipts.
-- Purely additive: new tables, new enums, and one new column with a default.

-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('APPROVED_UNFUNDED', 'ACTIVE', 'SETTLED', 'DEFAULTED');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('PROPOSED', 'VALUED', 'STORED', 'RETURNED', 'SOLD');

-- CreateEnum
CREATE TYPE "CustodyEventType" AS ENUM ('RECEIVED', 'INSPECTED', 'STORED', 'RELOCATED', 'RETURNED', 'SOLD');

-- CreateEnum
CREATE TYPE "ScheduleEntryStatus" AS ENUM ('PENDING', 'PAID');

-- CreateEnum
CREATE TYPE "PaymentAttemptType" AS ENUM ('DISBURSEMENT', 'REPAYMENT');

-- CreateEnum
CREATE TYPE "PaymentAttemptStatus" AS ENUM ('PENDING', 'COMMITTED', 'REJECTED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('DISBURSEMENT', 'REPAYMENT', 'SALE_RECEIPT');

-- AlterTable
ALTER TABLE "ApplicationAsset" ADD COLUMN "status" "AssetStatus" NOT NULL DEFAULT 'PROPOSED';

-- CreateTable
CREATE TABLE "ApplicationDecision" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "outcome" "ApplicationStatus" NOT NULL,
    "decidedById" TEXT NOT NULL,
    "reason" TEXT,
    "publicNote" TEXT,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Loan" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "borrowerId" TEXT NOT NULL,
    "status" "LoanStatus" NOT NULL DEFAULT 'APPROVED_UNFUNDED',
    "principal" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "periods" INTEGER NOT NULL,
    "firstPaymentDate" TIMESTAMP(3) NOT NULL,
    "interestMethod" TEXT,
    "policy" TEXT NOT NULL,
    "policyConfigured" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "disbursedAt" TIMESTAMP(3),
    "disbursedById" TEXT,
    "settledAt" TIMESTAMP(3),
    "defaultedAt" TIMESTAMP(3),
    "defaultedById" TEXT,
    "defaultReason" TEXT,
    "disbursementKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Loan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleEntry" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amount" TEXT NOT NULL,
    "paidAmount" TEXT NOT NULL DEFAULT '0.00',
    "status" "ScheduleEntryStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "type" "LedgerEntryType" NOT NULL,
    "amount" TEXT NOT NULL,
    "businessDate" TIMESTAMP(3) NOT NULL,
    "method" TEXT NOT NULL,
    "externalReference" TEXT,
    "note" TEXT,
    "postedById" TEXT NOT NULL,
    "attemptId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "ledgerEntryId" TEXT NOT NULL,
    "issuedById" TEXT NOT NULL,
    "summary" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAttempt" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "type" "PaymentAttemptType" NOT NULL,
    "loanId" TEXT NOT NULL,
    "initiatedById" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "requestBody" JSONB NOT NULL,
    "status" "PaymentAttemptStatus" NOT NULL DEFAULT 'PENDING',
    "failureReason" TEXT,
    "ledgerEntryId" TEXT,
    "committedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustodyEvent" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "loanId" TEXT,
    "type" "CustodyEventType" NOT NULL,
    "businessDate" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "inspectionResult" TEXT,
    "conditionNote" TEXT,
    "reason" TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustodyEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationDecision_applicationId_key" ON "ApplicationDecision"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "Loan_number_key" ON "Loan"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Loan_applicationId_key" ON "Loan"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "Loan_disbursementKey_key" ON "Loan"("disbursementKey");

-- CreateIndex
CREATE INDEX "Loan_status_updatedAt_idx" ON "Loan"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "Loan_borrowerId_idx" ON "Loan"("borrowerId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleEntry_loanId_number_key" ON "ScheduleEntry"("loanId", "number");

-- CreateIndex
CREATE INDEX "ScheduleEntry_loanId_dueDate_idx" ON "ScheduleEntry"("loanId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerEntry_attemptId_key" ON "LedgerEntry"("attemptId");

-- CreateIndex
CREATE INDEX "LedgerEntry_loanId_createdAt_idx" ON "LedgerEntry"("loanId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_number_key" ON "Receipt"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_ledgerEntryId_key" ON "Receipt"("ledgerEntryId");

-- CreateIndex
CREATE INDEX "Receipt_loanId_createdAt_idx" ON "Receipt"("loanId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_idempotencyKey_key" ON "PaymentAttempt"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_ledgerEntryId_key" ON "PaymentAttempt"("ledgerEntryId");

-- CreateIndex
CREATE INDEX "PaymentAttempt_loanId_status_idx" ON "PaymentAttempt"("loanId", "status");

-- CreateIndex
CREATE INDEX "PaymentAttempt_initiatedById_status_idx" ON "PaymentAttempt"("initiatedById", "status");

-- CreateIndex
CREATE INDEX "CustodyEvent_assetId_createdAt_idx" ON "CustodyEvent"("assetId", "createdAt");

-- CreateIndex
CREATE INDEX "ApplicationAsset_status_idx" ON "ApplicationAsset"("status");

-- AddForeignKey
ALTER TABLE "ApplicationDecision" ADD CONSTRAINT "ApplicationDecision_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationDecision" ADD CONSTRAINT "ApplicationDecision_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_borrowerId_fkey" FOREIGN KEY ("borrowerId") REFERENCES "Borrower"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_disbursedById_fkey" FOREIGN KEY ("disbursedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_defaultedById_fkey" FOREIGN KEY ("defaultedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleEntry" ADD CONSTRAINT "ScheduleEntry_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_ledgerEntryId_fkey" FOREIGN KEY ("ledgerEntryId") REFERENCES "LedgerEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_initiatedById_fkey" FOREIGN KEY ("initiatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustodyEvent" ADD CONSTRAINT "CustodyEvent_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "ApplicationAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustodyEvent" ADD CONSTRAINT "CustodyEvent_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustodyEvent" ADD CONSTRAINT "CustodyEvent_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
