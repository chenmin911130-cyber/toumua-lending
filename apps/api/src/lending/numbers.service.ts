import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class NumbersService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async nextBorrowerNumber() {
    return this.next("borrower", "BR");
  }

  async nextApplicationNumber() {
    return this.next("application", "APP");
  }

  private async next(key: string, prefix: string) {
    const counter = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.sequenceCounter.findUnique({ where: { key } });
      if (!existing) {
        return tx.sequenceCounter.create({ data: { key, value: 1 } });
      }
      return tx.sequenceCounter.update({
        where: { key },
        data: { value: { increment: 1 } },
      });
    });
    return `${prefix}-${String(counter.value).padStart(5, "0")}`;
  }
}
