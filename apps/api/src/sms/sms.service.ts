import { Inject, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { maskSmsPhone, normalizeSmsPhone } from "./phone";

export type SmsSendInput = {
  toPhone: string;
  body: string;
  borrowerId?: string | null;
  loanId?: string | null;
};

export type SmsSendResult = {
  id: string | null;
  status: "QUEUED" | "SENT" | "FAILED" | "SKIPPED";
};

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Records an outbox row and asks the configured driver to deliver it.
   * A failed reminder must not break the caller, so this method never throws.
   */
  async send(input: SmsSendInput): Promise<SmsSendResult> {
    const driver = smsDriver();
    try {
      const normalized = normalizeSmsPhone(input.toPhone);
      if (!normalized) {
        const skipped = await this.prisma.smsMessage.create({
          data: {
            toPhone: input.toPhone,
            body: input.body,
            status: "SKIPPED",
            driver,
            error: "invalid phone",
            borrowerId: input.borrowerId ?? null,
            loanId: input.loanId ?? null,
          },
        });
        return { id: skipped.id, status: "SKIPPED" };
      }

      const queued = await this.prisma.smsMessage.create({
        data: {
          toPhone: normalized,
          body: input.body,
          status: "QUEUED",
          driver,
          borrowerId: input.borrowerId ?? null,
          loanId: input.loanId ?? null,
        },
      });

      try {
        const providerRef = await this.dispatch(driver, normalized, input.body);
        await this.prisma.smsMessage.update({
          where: { id: queued.id },
          data: { status: "SENT", providerRef },
        });
        return { id: queued.id, status: "SENT" };
      } catch (error) {
        const message = error instanceof Error ? error.message : "send failed";
        this.logger.warn(`SMS send failed id=${queued.id}`);
        await this.prisma.smsMessage.update({
          where: { id: queued.id },
          data: { status: "FAILED", error: message.slice(0, 500) },
        });
        return { id: queued.id, status: "FAILED" };
      }
    } catch (error) {
      this.logger.warn(`SMS outbox write failed: ${error instanceof Error ? error.message : "unknown"}`);
      return { id: null, status: "FAILED" };
    }
  }

  private async dispatch(driver: string, to: string, body: string): Promise<string | null> {
    if (driver === "memory") return null;
    if (driver === "webhook") return postWebhook(to, body);
    this.logger.log(`SMS ${maskSmsPhone(to)} via log: ${body}`);
    return null;
  }
}

function smsDriver(): string {
  const driver = (process.env.SMS_DRIVER ?? "log").trim();
  return driver || "log";
}

async function postWebhook(to: string, body: string): Promise<string | null> {
  const url = process.env.SMS_WEBHOOK_URL?.trim();
  if (!url) throw new Error("SMS_WEBHOOK_URL is not set");
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ to, body }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`webhook ${response.status}`);
  return response.headers.get("x-provider-ref");
}
