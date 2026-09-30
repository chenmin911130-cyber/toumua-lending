-- CreateEnum
CREATE TYPE "SmsStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ReminderKind" AS ENUM ('DUE_SOON', 'DUE_TODAY', 'OVERDUE');

-- AlterTable
ALTER TABLE "Borrower" ADD COLUMN     "smsOptIn" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "SmsMessage" (
    "id" TEXT NOT NULL,
    "toPhone" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "SmsStatus" NOT NULL DEFAULT 'QUEUED',
    "driver" TEXT NOT NULL,
    "providerRef" TEXT,
    "error" TEXT,
    "borrowerId" TEXT,
    "loanId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmsMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepaymentReminder" (
    "id" TEXT NOT NULL,
    "scheduleEntryId" TEXT NOT NULL,
    "kind" "ReminderKind" NOT NULL,
    "smsMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepaymentReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SmsMessage_createdAt_idx" ON "SmsMessage"("createdAt");

-- CreateIndex
CREATE INDEX "SmsMessage_borrowerId_idx" ON "SmsMessage"("borrowerId");

-- CreateIndex
CREATE UNIQUE INDEX "RepaymentReminder_smsMessageId_key" ON "RepaymentReminder"("smsMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "RepaymentReminder_scheduleEntryId_kind_key" ON "RepaymentReminder"("scheduleEntryId", "kind");

-- AddForeignKey
ALTER TABLE "SmsMessage" ADD CONSTRAINT "SmsMessage_borrowerId_fkey" FOREIGN KEY ("borrowerId") REFERENCES "Borrower"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsMessage" ADD CONSTRAINT "SmsMessage_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepaymentReminder" ADD CONSTRAINT "RepaymentReminder_scheduleEntryId_fkey" FOREIGN KEY ("scheduleEntryId") REFERENCES "ScheduleEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepaymentReminder" ADD CONSTRAINT "RepaymentReminder_smsMessageId_fkey" FOREIGN KEY ("smsMessageId") REFERENCES "SmsMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
