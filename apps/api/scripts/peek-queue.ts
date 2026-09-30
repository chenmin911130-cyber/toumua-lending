import { config } from "dotenv";
import { resolve } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma";

config({ path: resolve(__dirname, "../../../.env") });

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  try {
    const apps = await prisma.application.findMany({
      select: { id: true, number: true, status: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 8,
    });
    const vals = await prisma.valuation.findMany({
      select: { id: true, status: true, applicationId: true, assetId: true },
      orderBy: { updatedAt: "desc" },
      take: 15,
    });
    const assets = await prisma.applicationAsset.findMany({
      select: { id: true, name: true, applicationId: true, status: true },
      take: 10,
    });
    const valuer = await prisma.user.findFirst({
      where: { emailNormalized: "valuation@toumua.nz" },
      select: { email: true, role: true, status: true },
    });
    const loans = await prisma.loan.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, number: true, status: true, applicationId: true },
    });
    const contracts = await prisma.loanContract.findMany({
      orderBy: { issuedAt: "desc" },
      take: 5,
      select: { id: true, number: true, status: true, loanId: true },
    });
    console.log(JSON.stringify({ apps, vals, assets, valuer, loans, contracts }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

void main();
