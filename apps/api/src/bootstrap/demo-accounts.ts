import { Permission, normalizeEmail } from "@toumua/contracts";
import { Prisma, PrismaClient } from "../generated/prisma";

export const DEMO_PASSWORD = "project721";
export const DEMO_EMAIL_DOMAIN = "toumua.nz";
const LEGACY_EMAIL_DOMAIN = "toumua.lending";

function demoEmail(localPart: string) {
  return `${localPart}@${DEMO_EMAIL_DOMAIN}`;
}

export const DEMO_CUSTOMERS = [
  {
    name: "Sarah Tama",
    email: demoEmail("sarah.tama"),
    phone: "021 150 1001",
    address: "12 Queen Street, Auckland 1010",
    notes: "Personal loan for home improvements",
  },
  {
    name: "James Latu",
    email: demoEmail("james.latu"),
    phone: "021 150 1002",
    address: "88 Lambton Quay, Wellington 6011",
    notes: "Vehicle finance enquiry",
  },
  {
    name: "Mere Kaho",
    email: demoEmail("mere.kaho"),
    phone: "021 150 1003",
    address: "44 Cashel Street, Christchurch 8011",
    notes: "Business finance follow-up",
  },
  {
    name: "Ana Folau",
    email: demoEmail("ana.folau"),
    phone: "021 150 1004",
    address: "9 Victoria Street, Hamilton 3204",
    notes: "Personal loan, first-time borrower",
  },
  {
    name: "David Chen",
    email: demoEmail("david.chen"),
    phone: "021 150 1005",
    address: "210 Dominion Road, Mount Eden, Auckland 1024",
    notes: "Used vehicle finance",
  },
  {
    name: "Sione Tapu",
    email: demoEmail("sione.tapu"),
    phone: "021 150 1006",
    address: "31 Great South Road, Manukau 2104",
    notes: "Family vehicle replacement",
  },
  {
    name: "Lisa Wong",
    email: demoEmail("lisa.wong"),
    phone: "021 150 1007",
    address: "15 Courtenay Place, Wellington 6011",
    notes: "Short-term personal loan",
  },
  {
    name: "Toma Vaka",
    email: demoEmail("toma.vaka"),
    phone: "021 150 1008",
    address: "6 Devonport Road, Tauranga 3110",
    notes: "Small business working capital",
  },
  {
    name: "Rachel Ngata",
    email: demoEmail("rachel.ngata"),
    phone: "021 150 1009",
    address: "27 George Street, Dunedin 9016",
    notes: "Home repair loan",
  },
  {
    name: "Peter Ioane",
    email: demoEmail("peter.ioane"),
    phone: "021 150 1010",
    address: "50 The Square, Palmerston North 4410",
    notes: "Personal loan, referred by Sarah Tama",
  },
] as const;

type PrismaLike = PrismaClient;

async function nextBorrowerNumber(prisma: PrismaLike): Promise<string> {
  const rows = await prisma.$queryRaw<Array<{ value: number }>>(Prisma.sql`
    INSERT INTO "SequenceCounter" ("key", "value")
    VALUES ('borrower', 1)
    ON CONFLICT ("key") DO UPDATE SET "value" = "SequenceCounter"."value" + 1
    RETURNING "value"
  `);
  const value = rows[0]?.value;
  if (typeof value !== "number") {
    throw new Error("Could not allocate a borrower number");
  }
  return `BR-${String(value).padStart(5, "0")}`;
}

async function upsertUser(
  prisma: PrismaLike,
  input: {
    email: string;
    name: string;
    passwordHash: string;
    role: "CUSTOMER" | "LOAN_OFFICER" | "MANAGER" | null;
    permissions?: string[];
  },
) {
  const emailNormalized = normalizeEmail(input.email);
  const legacyEmail = input.email.replace(`@${DEMO_EMAIL_DOMAIN}`, `@${LEGACY_EMAIL_DOMAIN}`);
  const existing =
    (await prisma.user.findUnique({ where: { emailNormalized } })) ??
    (legacyEmail !== input.email
      ? await prisma.user.findUnique({ where: { emailNormalized: normalizeEmail(legacyEmail) } })
      : null);
  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: {
          email: input.email,
          emailNormalized,
          name: input.name,
          passwordHash: input.passwordHash,
          role: input.role,
          status: "ACTIVE",
          emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
        },
      })
    : await prisma.user.create({
        data: {
          email: input.email,
          emailNormalized,
          name: input.name,
          passwordHash: input.passwordHash,
          role: input.role,
          status: "ACTIVE",
          emailVerifiedAt: new Date(),
        },
      });

  if (input.permissions?.length) {
    for (const permission of input.permissions) {
      await prisma.staffPermission.upsert({
        where: { userId_permission: { userId: user.id, permission } },
        update: {},
        create: { userId: user.id, permission },
      });
    }
  }

  return user;
}

export async function seedDemoAccounts(
  prisma: PrismaLike,
  hashPassword: (password: string) => Promise<string>,
) {
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const admin = await upsertUser(prisma, {
    email: demoEmail("admin"),
    name: "Workspace Admin",
    passwordHash,
    role: null,
    permissions: [Permission.MANAGE_STAFF, Permission.VIEW_AUDIT],
  });

  const legacyAdmin = await prisma.user.findUnique({
    where: { emailNormalized: "admin@example.com" },
  });
  if (legacyAdmin) {
    await prisma.user.update({
      where: { id: legacyAdmin.id },
      data: {
        passwordHash,
        status: "ACTIVE",
        emailVerifiedAt: legacyAdmin.emailVerifiedAt ?? new Date(),
      },
    });
  }

  const staff = await upsertUser(prisma, {
    email: demoEmail("staff"),
    name: "Louise Staff",
    passwordHash,
    role: "LOAN_OFFICER",
  });

  await upsertUser(prisma, {
    email: demoEmail("manager"),
    name: "Morgan Manager",
    passwordHash,
    role: "MANAGER",
  });

  for (const customer of DEMO_CUSTOMERS) {
    const user = await upsertUser(prisma, {
      email: customer.email,
      name: customer.name,
      passwordHash,
      role: "CUSTOMER",
    });

    const legacyBorrowerEmail = customer.email.replace(
      `@${DEMO_EMAIL_DOMAIN}`,
      `@${LEGACY_EMAIL_DOMAIN}`,
    );
    let borrower = await prisma.borrower.findFirst({
      where: { email: { in: [customer.email, legacyBorrowerEmail] } },
    });
    if (!borrower) {
      borrower = await prisma.borrower.create({
        data: {
          number: await nextBorrowerNumber(prisma),
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
          address: customer.address,
          notes: customer.notes,
          createdById: staff.id,
        },
      });
    } else {
      borrower = await prisma.borrower.update({
        where: { id: borrower.id },
        data: {
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
          address: customer.address,
          notes: customer.notes,
        },
      });
    }

    const existingLink = await prisma.borrowerAccountLink.findFirst({
      where: { userId: user.id, borrowerId: borrower.id },
    });
    if (existingLink) {
      if (existingLink.status !== "ACTIVE") {
        await prisma.borrowerAccountLink.update({
          where: { id: existingLink.id },
          data: { status: "ACTIVE", revokedAt: null },
        });
      }
    } else {
      await prisma.borrowerAccountLink.create({
        data: {
          borrowerId: borrower.id,
          userId: user.id,
          status: "ACTIVE",
          verificationMethod: "demo-seed",
          notes: "Demo account seeded for COMP721",
          linkedById: admin.id,
        },
      });
    }
  }
}
