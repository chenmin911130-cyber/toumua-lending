import { Inject, Injectable } from "@nestjs/common";
import * as argon2 from "argon2";
import {
  AcceptInvitationInput,
  BusinessRole,
  ChangePasswordInput,
  LoginInput,
  Permission,
  RegisterInput,
  ResetPasswordInput,
  UserStatus,
  normalizeEmail,
} from "@toumua/contracts";
import { PrismaService } from "../prisma/prisma.service";
import { MailService } from "../mail/mail.service";
import { AuditService } from "../audit/audit.service";
import { RateLimitService } from "../common/rate-limit.service";
import { hashToken, maskEmail, randomToken } from "../common/ids";
import {
  conflict,
  forbidden,
  notFound,
  unauthorized,
  validation,
} from "../common/http";
import { SESSION_DAYS, toPublicUser } from "./session";
import { TokenType, User } from "../generated/prisma";

const GENERIC_LOGIN = "Email or password is incorrect";
const GENERIC_RESET =
  "If an account exists for this email, you will receive a reset link.";

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MailService) private readonly mail: MailService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(RateLimitService) private readonly rateLimit: RateLimitService,
  ) {}

  webUrl(): string {
    return process.env.PUBLIC_WEB_URL ?? "http://127.0.0.1:5173";
  }

  verifyTtlMs(): number {
    return Number(process.env.VERIFY_TTL_HOURS ?? 24) * 60 * 60 * 1000;
  }

  resetTtlMs(): number {
    return Number(process.env.RESET_TTL_MINUTES ?? 30) * 60 * 1000;
  }

  inviteTtlMs(): number {
    return Number(process.env.INVITE_TTL_HOURS ?? 72) * 60 * 60 * 1000;
  }

  resendSeconds(): number {
    return Number(process.env.RESEND_INTERVAL_SECONDS ?? 60);
  }

  async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  async verifyPassword(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  async register(input: RegisterInput) {
    if (input.role && input.role !== BusinessRole.CUSTOMER) {
      throw forbidden("Public registration only creates a customer account");
    }
    const emailNormalized = normalizeEmail(input.email);
    const existing = await this.prisma.user.findUnique({
      where: { emailNormalized },
    });
    if (existing) {
      throw conflict("This email cannot be used", {
        email: ["This email cannot be used"],
      });
    }
    const passwordHash = await this.hashPassword(input.password);
    const user = await this.prisma.user.create({
      data: {
        email: input.email.trim(),
        emailNormalized,
        name: input.name,
        passwordHash,
        role: "CUSTOMER",
        status: "PENDING_VERIFICATION",
      },
    });
    await this.audit.write({
      actorId: user.id,
      action: "user.registered",
      objectType: "user",
      objectId: user.id,
      after: { email: user.email, role: user.role },
    });
    await this.issueVerificationEmail(user);
    const session = await this.createSession(user.id, true);
    return { user: toPublicUser(user, true), session };
  }

  async login(input: LoginInput) {
    const emailNormalized = normalizeEmail(input.email);
    await this.rateLimit.consume(`login:${emailNormalized}`, 10, 15 * 60);
    const user = await this.prisma.user.findUnique({
      where: { emailNormalized },
      include: { permissions: true },
    });
    if (!user || !user.passwordHash || user.status === "INVITED") {
      throw unauthorized(GENERIC_LOGIN);
    }
    if (user.status === "INACTIVE" || user.status === "INVITATION_REVOKED") {
      throw unauthorized(GENERIC_LOGIN);
    }
    const ok = await this.verifyPassword(user.passwordHash, input.password);
    if (!ok) {
      throw unauthorized(GENERIC_LOGIN);
    }
    const restricted =
      user.role === "CUSTOMER" && user.status === "PENDING_VERIFICATION";
    const session = await this.createSession(user.id, restricted);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    return { user: toPublicUser(user, restricted), session };
  }

  async me(userId: string, restricted: boolean) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { permissions: true },
    });
    if (!user) {
      throw unauthorized();
    }
    return toPublicUser(user, restricted);
  }

  async verifyEmail(token: string) {
    const record = await this.findToken(token, "EMAIL_VERIFY");
    if (!record) {
      return { result: "invalid" as const };
    }
    if (record.usedAt) {
      return { result: "already_used" as const };
    }
    if (record.expiresAt.getTime() < Date.now()) {
      return { result: "expired" as const };
    }
    const user = record.user;
    if (user.emailVerifiedAt) {
      await this.prisma.verificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      });
      return { result: "already_verified" as const };
    }
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: new Date(), status: "ACTIVE" },
      }),
      this.prisma.verificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.session.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    await this.audit.write({
      actorId: user.id,
      action: "user.email_verified",
      objectType: "user",
      objectId: user.id,
    });
    return { result: "verified" as const };
  }

  async resendVerification(userId: string) {
    const user = await this.requireUser(userId);
    if (user.emailVerifiedAt) {
      throw conflict("This email is already verified");
    }
    if (user.role !== "CUSTOMER" || user.status !== "PENDING_VERIFICATION") {
      throw forbidden();
    }
    await this.rateLimit.consume(
      `resend-verify:${user.id}`,
      1,
      this.resendSeconds(),
    );
    await this.issueVerificationEmail(user);
    return { sent: true, retryAfterSeconds: this.resendSeconds() };
  }

  async changePendingEmail(userId: string, email: string) {
    const user = await this.requireUser(userId);
    if (user.emailVerifiedAt || user.status !== "PENDING_VERIFICATION") {
      throw forbidden();
    }
    const emailNormalized = normalizeEmail(email);
    if (emailNormalized === user.emailNormalized) {
      return { email: maskEmail(user.email) };
    }
    const taken = await this.prisma.user.findUnique({
      where: { emailNormalized },
    });
    if (taken && taken.id !== user.id) {
      throw conflict("This email cannot be used", {
        email: ["This email cannot be used"],
      });
    }
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { email: email.trim(), emailNormalized },
    });
    await this.issueVerificationEmail(updated);
    return { email: maskEmail(updated.email) };
  }

  async forgotPassword(email: string) {
    const emailNormalized = normalizeEmail(email);
    await this.rateLimit.consume(`forgot:${emailNormalized}`, 5, 15 * 60);
    const user = await this.prisma.user.findUnique({
      where: { emailNormalized },
    });
    if (user?.passwordHash && user.status === "ACTIVE") {
      await this.issuePasswordReset(user);
    }
    return { message: GENERIC_RESET };
  }

  async resetPassword(input: ResetPasswordInput) {
    const record = await this.findToken(input.token, "PASSWORD_RESET");
    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      throw validation("This reset link is invalid or has expired", {
        token: ["This reset link is invalid or has expired"],
      });
    }
    const passwordHash = await this.hashPassword(input.password);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      }),
      this.prisma.verificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.session.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    await this.audit.write({
      actorId: record.userId,
      action: "user.password_reset",
      objectType: "user",
      objectId: record.userId,
    });
    return { reset: true };
  }

  async changePassword(userId: string, input: ChangePasswordInput) {
    const user = await this.requireUser(userId);
    if (!user.passwordHash) {
      throw forbidden();
    }
    const ok = await this.verifyPassword(user.passwordHash, input.currentPassword);
    if (!ok) {
      throw validation("Current password is incorrect", {
        currentPassword: ["Current password is incorrect"],
      });
    }
    const passwordHash = await this.hashPassword(input.password);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash },
      }),
      this.prisma.session.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    await this.audit.write({
      actorId: user.id,
      action: "user.password_changed",
      objectType: "user",
      objectId: user.id,
    });
    return { changed: true };
  }

  async inspectInvitation(token: string) {
    const record = await this.findToken(token, "INVITATION");
    if (!record) {
      return { valid: false as const, reason: "invalid" as const };
    }
    const invitation = await this.prisma.invitation.findUnique({
      where: { userId: record.userId },
    });
    if (!invitation || invitation.revokedAt || invitation.acceptedAt) {
      return { valid: false as const, reason: "revoked" as const };
    }
    if (
      record.usedAt ||
      record.expiresAt.getTime() < Date.now() ||
      invitation.expiresAt.getTime() < Date.now()
    ) {
      return { valid: false as const, reason: "expired" as const };
    }
    return {
      valid: true as const,
      email: maskEmail(invitation.email),
      role: invitation.role,
    };
  }

  async acceptInvitation(input: AcceptInvitationInput) {
    const record = await this.findToken(input.token, "INVITATION");
    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      throw validation("This invitation is invalid or has expired", {
        token: ["This invitation is invalid or has expired"],
      });
    }
    const invitation = await this.prisma.invitation.findUnique({
      where: { userId: record.userId },
    });
    if (!invitation || invitation.revokedAt || invitation.acceptedAt) {
      throw validation("This invitation is no longer active", {
        token: ["This invitation is no longer active"],
      });
    }
    if (invitation.expiresAt.getTime() < Date.now()) {
      throw validation("This invitation has expired", {
        token: ["This invitation has expired"],
      });
    }
    const passwordHash = await this.hashPassword(input.password);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: {
          passwordHash,
          name: input.name?.trim() || record.user.name,
          status: "ACTIVE",
          emailVerifiedAt: new Date(),
          role: invitation.role,
        },
      }),
      this.prisma.invitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      }),
      this.prisma.verificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);
    await this.audit.write({
      actorId: record.userId,
      action: "staff.invitation_accepted",
      objectType: "user",
      objectId: record.userId,
      after: { role: invitation.role },
    });
    return { activated: true, role: invitation.role };
  }

  async createSession(userId: string, restricted: boolean) {
    const token = randomToken();
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
    const session = await this.prisma.session.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        expiresAt,
        restricted,
      },
    });
    return { id: session.id, token, expiresAt, restricted };
  }

  async resolveSession(rawToken: string | undefined) {
    if (!rawToken) {
      return null;
    }
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      include: {
        user: { include: { permissions: true } },
      },
    });
    if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) {
      return null;
    }
    if (
      session.user.status === "INACTIVE" ||
      session.user.status === "INVITATION_REVOKED"
    ) {
      return null;
    }
    await this.prisma.session.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    });
    return {
      session,
      user: toPublicUser(session.user, session.restricted),
    };
  }

  async revokeSession(sessionId: string) {
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllSessions(userId: string) {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async issueInvitationToken(user: User, role: string) {
    const token = await this.replaceToken(
      user.id,
      "INVITATION",
      new Date(Date.now() + this.inviteTtlMs()),
    );
    const link = `${this.webUrl()}/accept-invitation?token=${encodeURIComponent(token)}`;
    await this.mail.send({
      userId: user.id,
      to: user.email,
      subject: "You have been invited to Toumu’a Lending workspace",
      text: `Activate your ${role} account: ${link}`,
      html: `<p>Activate your ${role} account.</p><p><a href="${link}">Activate account</a></p>`,
    });
    return token;
  }

  async latestMail(email: string) {
    return this.mail.latestTo(email);
  }

  extractTokenFromMail(body: string | null | undefined): string | null {
    if (!body) return null;
    const match = body.match(/token=([A-Za-z0-9_\-]+)/);
    return match?.[1] ?? null;
  }

  private async issueVerificationEmail(user: User) {
    const token = await this.replaceToken(
      user.id,
      "EMAIL_VERIFY",
      new Date(Date.now() + this.verifyTtlMs()),
    );
    const link = `${this.webUrl()}/verify-email?token=${encodeURIComponent(token)}`;
    await this.mail.send({
      userId: user.id,
      to: user.email,
      subject: "Verify your Toumu’a account",
      text: `Verify your email: ${link}`,
      html: `<p>Verify your email address.</p><p><a href="${link}">Verify email</a></p>`,
    });
  }

  private async issuePasswordReset(user: User) {
    const token = await this.replaceToken(
      user.id,
      "PASSWORD_RESET",
      new Date(Date.now() + this.resetTtlMs()),
    );
    const link = `${this.webUrl()}/reset-password?token=${encodeURIComponent(token)}`;
    await this.mail.send({
      userId: user.id,
      to: user.email,
      subject: "Reset your Toumu’a password",
      text: `Reset your password: ${link}`,
      html: `<p>Reset your password.</p><p><a href="${link}">Reset password</a></p>`,
    });
  }

  private async replaceToken(
    userId: string,
    type: TokenType,
    expiresAt: Date,
  ): Promise<string> {
    await this.prisma.verificationToken.updateMany({
      where: { userId, type, usedAt: null },
      data: { usedAt: new Date() },
    });
    const token = randomToken();
    await this.prisma.verificationToken.create({
      data: {
        userId,
        type,
        tokenHash: hashToken(token),
        expiresAt,
      },
    });
    return token;
  }

  private async findToken(token: string, type: TokenType) {
    return this.prisma.verificationToken.findFirst({
      where: { tokenHash: hashToken(token), type },
      include: { user: true },
    });
  }

  private async requireUser(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw unauthorized();
    }
    return user;
  }

  hasPermission(
    user: { permissions: Permission[]; role: string | null },
    permission: Permission,
  ): boolean {
    return user.permissions.includes(permission);
  }
}
