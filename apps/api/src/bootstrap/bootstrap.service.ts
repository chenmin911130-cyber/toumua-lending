import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Permission, normalizeEmail } from "@toumua/contracts";
import { PrismaService } from "../prisma/prisma.service";
import { AuthService } from "../auth/auth.service";
import { seedDemoAccounts } from "./demo-accounts";

@Injectable()
export class BootstrapService implements OnModuleInit {
  private readonly logger = new Logger(BootstrapService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureBootstrapAdmin();
    if (process.env.NODE_ENV === "test") return;
    await seedDemoAccounts(this.prisma, (password) => this.auth.hashPassword(password));
    this.logger.log("Seeded COMP721 demo accounts with password 123456");
  }

  private async ensureBootstrapAdmin(): Promise<void> {
    const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
    const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
    const name = process.env.BOOTSTRAP_ADMIN_NAME ?? "Workspace Admin";
    if (!email || !password) {
      return;
    }
    const existing = await this.prisma.staffPermission.findFirst({
      where: { permission: Permission.MANAGE_STAFF, user: { status: "ACTIVE" } },
    });
    if (existing) {
      return;
    }
    const passwordHash = await this.auth.hashPassword(password);
    const user = await this.prisma.user.create({
      data: {
        email: email.trim(),
        emailNormalized: normalizeEmail(email),
        name,
        passwordHash,
        role: null,
        status: "ACTIVE",
        emailVerifiedAt: new Date(),
        permissions: {
          create: [
            { permission: Permission.MANAGE_STAFF },
            { permission: Permission.VIEW_AUDIT },
          ],
        },
      },
    });
    this.logger.log(`Created bootstrap administrator ${user.id}`);
  }
}
