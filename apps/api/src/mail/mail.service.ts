import { Inject, Injectable, Logger } from "@nestjs/common";
import nodemailer, { Transporter } from "nodemailer";
import { PrismaService } from "../prisma/prisma.service";
import { mailUnavailable } from "../common/http";

/** True when a message can leave this process. Loopback SMTP and a missing host cannot. */
export function mailIsDeliverable(): boolean {
  // Railway demo: skip real SMTP and allow in-app verification on the pending page.
  if (process.env.DEMO_IN_APP_EMAIL_VERIFY === "1") return false;
  const driver = process.env.MAIL_DRIVER ?? "smtp";
  if (driver === "memory") return true;
  if (driver !== "smtp") return false;
  const host = (process.env.MAIL_SMTP_HOST ?? "127.0.0.1").trim().toLowerCase();
  return host !== "127.0.0.1" && host !== "localhost" && host !== "::1";
}

/** Pending-page "Verify account" — demo flag wins even if SMTP env is misconfigured. */
export function inAppEmailVerifyAllowed(): boolean {
  if (process.env.DEMO_IN_APP_EMAIL_VERIFY === "1") return true;
  return !mailIsDeliverable();
}

type SendMailInput = {
  userId?: string;
  to: string;
  subject: string;
  text: string;
  html: string;
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    const driver = process.env.MAIL_DRIVER ?? "smtp";
    if (driver === "smtp") {
      this.transporter = nodemailer.createTransport({
        host: process.env.MAIL_SMTP_HOST ?? "127.0.0.1",
        port: Number(process.env.MAIL_SMTP_PORT ?? 1025),
        secure: false,
      });
    }
  }

  async send(input: SendMailInput): Promise<{ id: string; status: "ACCEPTED" }> {
    const row = await this.prisma.mailMessage.create({
      data: {
        userId: input.userId,
        toEmail: input.to,
        subject: input.subject,
        textBody: input.text,
        htmlBody: input.html,
        status: "QUEUED",
      },
    });

    const driver = process.env.MAIL_DRIVER ?? "smtp";
    try {
      if (process.env.MAIL_FORCE_FAIL === "true") {
        throw new Error("forced mail failure");
      }
      if (driver === "memory") {
        await this.prisma.mailMessage.update({
          where: { id: row.id },
          data: { status: "ACCEPTED", providerAccepted: true },
        });
        return { id: row.id, status: "ACCEPTED" };
      }
      if (!this.transporter) {
        throw new Error("SMTP transporter is not configured");
      }
      await this.transporter.sendMail({
        from: process.env.MAIL_FROM ?? "noreply@localhost",
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
      });
      await this.prisma.mailMessage.update({
        where: { id: row.id },
        data: { status: "ACCEPTED", providerAccepted: true },
      });
      return { id: row.id, status: "ACCEPTED" };
    } catch (error) {
      const message = error instanceof Error ? error.message : "send failed";
      this.logger.warn(`Mail send failed id=${row.id}`);
      await this.prisma.mailMessage.update({
        where: { id: row.id },
        data: { status: "FAILED", providerAccepted: false, error: message },
      });
      throw mailUnavailable();
    }
  }

  async latestTo(email: string) {
    return this.prisma.mailMessage.findFirst({
      where: { toEmail: email, status: "ACCEPTED" },
      orderBy: { createdAt: "desc" },
    });
  }
}
