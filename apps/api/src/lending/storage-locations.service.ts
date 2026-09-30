import { Inject, Injectable } from "@nestjs/common";
import {
  StorageLocationDetail,
  StorageLocationInput,
  StorageLocationListQuery,
  StorageLocationUpdateInput,
  StorageLocationView,
} from "@toumua/contracts";
import { AuthUser } from "../auth/session";
import { conflict, notFound } from "../common/http";
import { AuditService } from "../audit/audit.service";
import { Prisma } from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import { assertManageStorageLocations, assertReadLedger } from "./access";
import { assetsAtLocation, occupiedByLocation } from "./storage-occupancy";

const TRACKED_FIELDS = ["code", "name", "kind", "secure", "capacity", "notes", "active"] as const;

function toView(
  row: {
    id: string;
    code: string;
    name: string;
    kind: StorageLocationView["kind"];
    secure: boolean;
    capacity: number | null;
    notes: string | null;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
  },
  occupied: number,
): StorageLocationView {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    kind: row.kind,
    secure: row.secure,
    capacity: row.capacity,
    notes: row.notes,
    active: row.active,
    occupied,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function changedFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
) {
  const previous: Record<string, unknown> = {};
  const next: Record<string, unknown> = {};
  for (const field of TRACKED_FIELDS) {
    if (before[field] !== after[field]) {
      previous[field] = before[field] ?? null;
      next[field] = after[field] ?? null;
    }
  }
  return { before: previous, after: next };
}

function blankToNull(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

@Injectable()
export class StorageLocationsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser, query: StorageLocationListQuery) {
    assertReadLedger(user);
    const where =
      query.active === "true" ? { active: true } : query.active === "false" ? { active: false } : {};
    const [rows, occupied] = await Promise.all([
      this.prisma.storageLocation.findMany({ where, orderBy: { code: "asc" } }),
      occupiedByLocation(this.prisma),
    ]);
    return { items: rows.map((row) => toView(row, occupied.get(row.id) ?? 0)) };
  }

  async get(user: AuthUser, id: string): Promise<StorageLocationDetail> {
    assertReadLedger(user);
    const row = await this.prisma.storageLocation.findUnique({ where: { id } });
    if (!row) throw notFound("Storage location not found");
    const assets = await assetsAtLocation(this.prisma, id);
    return {
      ...toView(row, assets.length),
      assets: assets.map((asset) => ({
        id: asset.id,
        name: asset.name,
        borrowerName: asset.application.borrower?.name ?? null,
        borrowerNumber: asset.application.borrower?.number ?? null,
        loanNumber: asset.application.loan?.number ?? null,
      })),
    };
  }

  async create(user: AuthUser, input: StorageLocationInput): Promise<StorageLocationView> {
    assertManageStorageLocations(user);
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const created = await tx.storageLocation.create({
          data: {
            code: input.code,
            name: input.name,
            kind: input.kind,
            secure: input.secure ?? true,
            capacity: input.capacity ?? null,
            notes: blankToNull(input.notes),
            active: input.active ?? true,
          },
        });
        await this.audit.write(
          {
            actorId: user.id,
            action: "storage_location.create",
            objectType: "StorageLocation",
            objectId: created.id,
            after: {
              code: created.code,
              name: created.name,
              kind: created.kind,
              secure: created.secure,
              capacity: created.capacity,
              notes: created.notes,
              active: created.active,
            },
          },
          tx,
        );
        return created;
      });
      return toView(row, 0);
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async update(
    user: AuthUser,
    id: string,
    input: StorageLocationUpdateInput,
  ): Promise<StorageLocationView> {
    assertManageStorageLocations(user);
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const current = await tx.storageLocation.findUnique({ where: { id } });
        if (!current) throw notFound("Storage location not found");
        if (input.active === false && current.active) {
          const held = await assetsAtLocation(tx, id);
          if (held.length > 0) {
            throw conflict("Move the stored assets out before deactivating this location");
          }
        }
        const updated = await tx.storageLocation.update({
          where: { id },
          data: {
            ...(input.code !== undefined ? { code: input.code } : {}),
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.kind !== undefined ? { kind: input.kind } : {}),
            ...(input.secure !== undefined ? { secure: input.secure } : {}),
            ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
            ...(input.notes !== undefined ? { notes: blankToNull(input.notes) } : {}),
            ...(input.active !== undefined ? { active: input.active } : {}),
          },
        });
        const changes = changedFields(current, updated);
        if (Object.keys(changes.after).length > 0) {
          await this.audit.write(
            {
              actorId: user.id,
              action: "storage_location.update",
              objectType: "StorageLocation",
              objectId: id,
              before: changes.before,
              after: changes.after,
            },
            tx,
          );
        }
        return updated;
      });
      const occupied = (await assetsAtLocation(this.prisma, id)).length;
      return toView(row, occupied);
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  private rethrowUnique(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw conflict("A location with this code already exists");
    }
    throw error;
  }
}
