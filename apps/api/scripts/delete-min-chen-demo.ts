import { config } from "dotenv";
import { resolve } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma";

config({ path: resolve(__dirname, "../../../.env") });

const DEMO_USER_EMAILS = ["525831644@qq.com", "5258316@qq.com"] as const;

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  try {
    const borrowers = await prisma.borrower.findMany({
      where: {
        OR: [
          { email: { in: [...DEMO_USER_EMAILS] } },
          { name: { equals: "min chen", mode: "insensitive" } },
        ],
      },
    });
    const users = await prisma.user.findMany({
      where: { emailNormalized: { in: DEMO_USER_EMAILS.map((e) => e.toLowerCase()) } },
    });

    for (const borrower of borrowers) {
      const apps = await prisma.application.findMany({ where: { borrowerId: borrower.id } });
      for (const app of apps) {
        const loan = await prisma.loan.findUnique({ where: { applicationId: app.id } });
        if (loan) {
          await prisma.loan.delete({ where: { id: loan.id } });
          console.log("Deleted loan", loan.number);
        }
        await prisma.application.delete({ where: { id: app.id } });
        console.log("Deleted application", app.number);
      }
      await prisma.borrowerAccountLink.deleteMany({ where: { borrowerId: borrower.id } });
      await prisma.borrower.delete({ where: { id: borrower.id } });
      console.log("Deleted borrower", borrower.number, borrower.name);
    }

    for (const user of users) {
      await prisma.borrowerAccountLink.deleteMany({ where: { userId: user.id } });
      await prisma.session.deleteMany({ where: { userId: user.id } });
      await prisma.verificationToken.deleteMany({ where: { userId: user.id } });
      await prisma.notification.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
      console.log("Deleted user", user.email, user.name);
    }

    console.log("Done.");
  } finally {
    await prisma.$disconnect();
  }
}

void main();
