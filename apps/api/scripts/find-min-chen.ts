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
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { name: { contains: "min", mode: "insensitive" } },
          { name: { contains: "chen", mode: "insensitive" } },
          { email: { contains: "min", mode: "insensitive" } },
        ],
      },
      select: { id: true, name: true, email: true, role: true },
    });
    const borrowers = await prisma.borrower.findMany({
      where: {
        OR: [
          { name: { contains: "min", mode: "insensitive" } },
          { name: { contains: "chen", mode: "insensitive" } },
          { email: { contains: "min", mode: "insensitive" } },
        ],
      },
      select: { id: true, name: true, email: true, number: true },
    });
    console.log(JSON.stringify({ users, borrowers }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

void main();
