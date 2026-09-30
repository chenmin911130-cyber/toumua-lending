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
    const loans = await prisma.loan.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, number: true, status: true, applicationId: true },
    });
    const contracts = await prisma.loanContract.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, number: true, status: true, loanId: true },
    });
    console.log(JSON.stringify({ loans, contracts }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

void main();
