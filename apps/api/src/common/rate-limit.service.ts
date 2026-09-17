import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { rateLimited } from "./http";

@Injectable()
export class RateLimitService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async consume(key: string, limit: number, windowSeconds: number): Promise<void> {
    const since = new Date(Date.now() - windowSeconds * 1000);
    const count = await this.prisma.rateLimitHit.count({
      where: { key, createdAt: { gte: since } },
    });
    if (count >= limit) {
      const oldest = await this.prisma.rateLimitHit.findFirst({
        where: { key, createdAt: { gte: since } },
        orderBy: { createdAt: "asc" },
      });
      const retryAfterSeconds = oldest
        ? Math.max(
            1,
            Math.ceil(
              (oldest.createdAt.getTime() + windowSeconds * 1000 - Date.now()) /
                1000,
            ),
          )
        : windowSeconds;
      throw rateLimited(retryAfterSeconds);
    }
    await this.prisma.rateLimitHit.create({ data: { key } });
  }
}
