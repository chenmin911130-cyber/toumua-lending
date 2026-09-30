-- CreateEnum
CREATE TYPE "StorageLocationKind" AS ENUM ('SAFE', 'LOCKED_CABINET', 'SHELF', 'SECURE_YARD', 'OFFSITE');

-- AlterTable
ALTER TABLE "CustodyEvent" ADD COLUMN     "storageLocationId" TEXT;

-- CreateTable
CREATE TABLE "StorageLocation" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "StorageLocationKind" NOT NULL,
    "secure" BOOLEAN NOT NULL DEFAULT true,
    "capacity" INTEGER,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorageLocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StorageLocation_code_key" ON "StorageLocation"("code");

-- CreateIndex
CREATE INDEX "CustodyEvent_storageLocationId_idx" ON "CustodyEvent"("storageLocationId");

-- AddForeignKey
ALTER TABLE "CustodyEvent" ADD CONSTRAINT "CustodyEvent_storageLocationId_fkey" FOREIGN KEY ("storageLocationId") REFERENCES "StorageLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
