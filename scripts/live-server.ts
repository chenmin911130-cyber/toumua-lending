/**
 * Throwaway API instance for the live smoke script.
 *
 * Mirrors apps/api/src/main.ts but honours an explicit API_PORT, and can seed
 * the staff test accounts when SMOKE_SEED=1 so the smoke run has someone to log
 * in as. Uses the app's own AuthService, so seeded password hashes are exactly
 * what a real account would carry.
 */
import "reflect-metadata";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { createApp } from "../apps/api/src/create-app";
import { PrismaService } from "../apps/api/src/prisma/prisma.service";
import { AuthService } from "../apps/api/src/auth/auth.service";

async function main() {
  if (process.env.SMOKE_SEED === "1") {
    const { resetDb, seedAdmin, seedCashier, seedLoanOfficer, seedManager, seedValuationOfficer } =
      await import("../apps/api/test/helpers");
    const seeded = await createApp();
    await seeded.init();
    const prisma = seeded.get(PrismaService);
    const auth = seeded.get(AuthService);
    await resetDb(prisma);
    await seedAdmin(prisma, auth);
    await seedLoanOfficer(prisma, auth);
    await seedValuationOfficer(prisma, auth);
    await seedManager(prisma, auth);
    await seedCashier(prisma, auth);
    console.log("seeded smoke staff accounts");
    await seeded.close();
  }

  const app = await createApp();
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder().setTitle("Toumu'a API").setVersion("0.1.0").build(),
  );
  SwaggerModule.setup("api/docs", app, document);
  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port, "127.0.0.1");
  console.log(`listening on ${port}`);
}

void main().catch((error) => {
  console.error("BOOT ERROR", error);
  process.exit(1);
});
