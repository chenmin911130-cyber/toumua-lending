import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";

type Client = Prisma.TransactionClient | PrismaService;

@Injectable()
export class NumbersService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  nextBorrowerNumber() {
    return this.next("borrower", "BR");
  }

  nextApplicationNumber() {
    return this.next("application", "APP");
  }

  nextLoanNumber(client?: Client) {
    return this.next("loan", "LN", client);
  }

  nextReceiptNumber(client?: Client) {
    return this.next("receipt", "RC", client);
  }

  /**
   * Allocates the next number in a sequence.
   *
   * A read-then-write pair lets two concurrent callers read the same value and
   * hand out the same number, and the unique index then turns an ordinary
   * concurrent request into a 500. One upsert with an atomic increment avoids
   * that and works both standalone and inside a caller's transaction.
   */
  private async next(key: string, prefix: string, client: Client = this.prisma): Promise<string> {
    const rows = await client.$queryRaw<Array<{ value: number }>>(Prisma.sql`
      INSERT INTO "SequenceCounter" ("key", "value")
      VALUES (${key}, 1)
      ON CONFLICT ("key") DO UPDATE SET "value" = "SequenceCounter"."value" + 1
      RETURNING "value"
    `);
    const value = rows[0]?.value;
    if (typeof value !== "number") {
      throw new Error(`Could not allocate a number for sequence ${key}`);
    }
    return `${prefix}-${String(value).padStart(5, "0")}`;
  }
}
