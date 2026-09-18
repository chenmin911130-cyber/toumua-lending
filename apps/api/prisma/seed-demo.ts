import { config } from "dotenv";
import { resolve } from "node:path";
import argon2 from "argon2";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma";
import { DEMO_CUSTOMERS, DEMO_PASSWORD, seedDemoAccounts } from "../src/bootstrap/demo-accounts";

config({ path: resolve(__dirname, "../../../.env") });

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    await seedDemoAccounts(prisma, (password) =>
      argon2.hash(password, { type: argon2.argon2id }),
    );
    console.log("Demo accounts ready. Password for all: 123456");
    console.log("  Admin     admin@toumua.lending    /staff/login");
    console.log("  Staff     staff@toumua.lending    /staff/login");
    console.log("  Customer  sarah.tama@toumua.lending   /login");
    console.log(`  Customers seeded: ${DEMO_CUSTOMERS.length}`);
    console.log(`  Shared password: ${DEMO_PASSWORD}`);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
