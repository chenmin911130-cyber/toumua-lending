-- CreateEnum
CREATE TYPE "ArrangementMethod" AS ENUM ('BANK_AUTOMATIC_PAYMENT', 'DIRECT_DEBIT');

-- CreateEnum
CREATE TYPE "ArrangementStatus" AS ENUM ('REQUESTED', 'ACTIVE', 'CANCELLED');

-- CreateTable
CREATE TABLE "RepaymentArrangement" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "method" "ArrangementMethod" NOT NULL,
    "status" "ArrangementStatus" NOT NULL DEFAULT 'REQUESTED',
    "accountName" TEXT NOT NULL,
    "accountNumberLast4" TEXT NOT NULL,
    "bankName" TEXT,
    "requestedById" TEXT NOT NULL,
    "consentedById" TEXT NOT NULL,
    "consentedAt" TIMESTAMP(3) NOT NULL,
    "consentHow" TEXT NOT NULL,
    "activatedById" TEXT,
    "activatedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RepaymentArrangement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionAttempt" (
    "id" TEXT NOT NULL,
    "arrangementId" TEXT NOT NULL,
    "scheduleEntryId" TEXT NOT NULL,
    "collectionDate" TIMESTAMP(3) NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollectionAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RepaymentArrangement_loanId_status_idx" ON "RepaymentArrangement"("loanId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionAttempt_idempotencyKey_key" ON "CollectionAttempt"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionAttempt_arrangementId_scheduleEntryId_collectionD_key" ON "CollectionAttempt"("arrangementId", "scheduleEntryId", "collectionDate");

-- AddForeignKey
ALTER TABLE "RepaymentArrangement" ADD CONSTRAINT "RepaymentArrangement_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepaymentArrangement" ADD CONSTRAINT "RepaymentArrangement_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepaymentArrangement" ADD CONSTRAINT "RepaymentArrangement_consentedById_fkey" FOREIGN KEY ("consentedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepaymentArrangement" ADD CONSTRAINT "RepaymentArrangement_activatedById_fkey" FOREIGN KEY ("activatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionAttempt" ADD CONSTRAINT "CollectionAttempt_arrangementId_fkey" FOREIGN KEY ("arrangementId") REFERENCES "RepaymentArrangement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionAttempt" ADD CONSTRAINT "CollectionAttempt_scheduleEntryId_fkey" FOREIGN KEY ("scheduleEntryId") REFERENCES "ScheduleEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
