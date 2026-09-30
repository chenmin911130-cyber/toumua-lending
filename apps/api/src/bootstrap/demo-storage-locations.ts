import type { PrismaClient } from "../generated/prisma";

export const DEMO_STORAGE_LOCATIONS = [
  { code: "SAFE-A-01", name: "Main safe", kind: "SAFE" as const, secure: true, capacity: 10 },
  { code: "SAFE-A-02", name: "Main safe lower shelf", kind: "SAFE" as const, secure: true, capacity: 10 },
  { code: "CAB-B-01", name: "Locked cabinet B", kind: "LOCKED_CABINET" as const, secure: true, capacity: 8 },
  { code: "YARD-01", name: "Secure vehicle yard", kind: "SECURE_YARD" as const, secure: true, capacity: 6 },
  { code: "OFF-01", name: "Off-site storage (partner)", kind: "OFFSITE" as const, secure: true, capacity: 20 },
];

/** Idempotent demo vault locations for intake / custody (COMP721). */
export async function seedDemoStorageLocations(prisma: PrismaClient) {
  const byCode = new Map<string, string>();
  for (const location of DEMO_STORAGE_LOCATIONS) {
    const row = await prisma.storageLocation.upsert({
      where: { code: location.code },
      create: { ...location, active: true },
      update: {
        name: location.name,
        kind: location.kind,
        secure: location.secure,
        capacity: location.capacity,
        active: true,
      },
    });
    byCode.set(location.code, row.id);
  }
  return byCode;
}
