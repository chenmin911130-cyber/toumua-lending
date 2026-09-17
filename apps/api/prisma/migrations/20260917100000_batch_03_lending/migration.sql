-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'DECLINED');

-- CreateEnum
CREATE TYPE "ApplicationStep" AS ENUM ('BORROWER', 'LOAN_DETAILS', 'SECURITY', 'TERMS', 'REVIEW');

-- CreateEnum
CREATE TYPE "ValuationStatus" AS ENUM ('REQUESTED', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "AccountLinkStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateTable
CREATE TABLE "SequenceCounter" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "SequenceCounter_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Borrower" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "salutation" TEXT,
    "email" TEXT,
    "phone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Borrower_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BorrowerAccountLink" (
    "id" TEXT NOT NULL,
    "borrowerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "AccountLinkStatus" NOT NULL DEFAULT 'ACTIVE',
    "verificationMethod" TEXT NOT NULL,
    "notes" TEXT,
    "linkedById" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BorrowerAccountLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "borrowerId" TEXT,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'DRAFT',
    "currentStep" "ApplicationStep" NOT NULL DEFAULT 'BORROWER',
    "version" INTEGER NOT NULL DEFAULT 1,
    "requestedAmount" TEXT,
    "purpose" TEXT,
    "purposeDescription" TEXT,
    "proposedTermMonths" INTEGER,
    "createdById" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationAsset" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "category" TEXT,
    "identifier" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ApplicationAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetPhoto" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssetPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationTerms" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "firstPaymentDate" TIMESTAMP(3),
    "frequency" TEXT,
    "periods" INTEGER,
    "interestMethod" TEXT,
    "policyConfigured" BOOLEAN NOT NULL DEFAULT false,
    "previewJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ApplicationTerms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Valuation" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "status" "ValuationStatus" NOT NULL DEFAULT 'REQUESTED',
    "amount" TEXT,
    "valuationDate" TIMESTAMP(3),
    "basis" TEXT,
    "borrowerPresent" BOOLEAN,
    "loanOfficerId" TEXT,
    "valuationOfficerId" TEXT,
    "participatedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Valuation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Borrower_number_key" ON "Borrower"("number");

-- CreateIndex
CREATE INDEX "Borrower_name_idx" ON "Borrower"("name");

-- CreateIndex
CREATE INDEX "Borrower_phone_idx" ON "Borrower"("phone");

-- CreateIndex
CREATE INDEX "BorrowerAccountLink_userId_status_idx" ON "BorrowerAccountLink"("userId", "status");

-- CreateIndex
CREATE INDEX "BorrowerAccountLink_borrowerId_status_idx" ON "BorrowerAccountLink"("borrowerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Application_number_key" ON "Application"("number");

-- CreateIndex
CREATE INDEX "Application_status_updatedAt_idx" ON "Application"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "Application_borrowerId_idx" ON "Application"("borrowerId");

-- CreateIndex
CREATE INDEX "ApplicationAsset_applicationId_idx" ON "ApplicationAsset"("applicationId");

-- CreateIndex
CREATE INDEX "AssetPhoto_assetId_idx" ON "AssetPhoto"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationTerms_applicationId_key" ON "ApplicationTerms"("applicationId");

-- CreateIndex
CREATE INDEX "Valuation_applicationId_idx" ON "Valuation"("applicationId");

-- CreateIndex
CREATE INDEX "Valuation_status_idx" ON "Valuation"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Valuation_assetId_key" ON "Valuation"("assetId");

-- AddForeignKey
ALTER TABLE "Borrower" ADD CONSTRAINT "Borrower_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BorrowerAccountLink" ADD CONSTRAINT "BorrowerAccountLink_borrowerId_fkey" FOREIGN KEY ("borrowerId") REFERENCES "Borrower"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BorrowerAccountLink" ADD CONSTRAINT "BorrowerAccountLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BorrowerAccountLink" ADD CONSTRAINT "BorrowerAccountLink_linkedById_fkey" FOREIGN KEY ("linkedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_borrowerId_fkey" FOREIGN KEY ("borrowerId") REFERENCES "Borrower"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationAsset" ADD CONSTRAINT "ApplicationAsset_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetPhoto" ADD CONSTRAINT "AssetPhoto_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "ApplicationAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationTerms" ADD CONSTRAINT "ApplicationTerms_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Valuation" ADD CONSTRAINT "Valuation_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Valuation" ADD CONSTRAINT "Valuation_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "ApplicationAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Valuation" ADD CONSTRAINT "Valuation_loanOfficerId_fkey" FOREIGN KEY ("loanOfficerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Valuation" ADD CONSTRAINT "Valuation_valuationOfficerId_fkey" FOREIGN KEY ("valuationOfficerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
