import { Prisma } from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";

type DbClient = PrismaService | Prisma.TransactionClient;

const placementFilter = {
  type: { in: ["STORED", "RELOCATED"] as ("STORED" | "RELOCATED")[] },
};

export async function occupiedByLocation(client: DbClient) {
  const stored = await client.applicationAsset.findMany({
    where: { status: "STORED" },
    select: {
      custody: {
        where: placementFilter,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 1,
        select: { storageLocationId: true },
      },
    },
  });
  const counts = new Map<string, number>();
  for (const asset of stored) {
    const locationId = asset.custody[0]?.storageLocationId;
    if (!locationId) continue;
    counts.set(locationId, (counts.get(locationId) ?? 0) + 1);
  }
  return counts;
}

export async function countOccupied(client: DbClient, locationId: string, excludeAssetId?: string) {
  const assets = await assetsAtLocation(client, locationId);
  return excludeAssetId ? assets.filter((asset) => asset.id !== excludeAssetId).length : assets.length;
}

export async function assetsAtLocation(client: DbClient, locationId: string) {
  const stored = await client.applicationAsset.findMany({
    where: { status: "STORED" },
    select: {
      id: true,
      name: true,
      application: {
        select: {
          borrower: { select: { name: true, number: true } },
          loan: { select: { number: true } },
        },
      },
      custody: {
        where: placementFilter,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 1,
        select: { storageLocationId: true },
      },
    },
  });
  return stored.filter((asset) => asset.custody[0]?.storageLocationId === locationId);
}
