import { Injectable } from '@nestjs/common';
import { animalCreateSchema, animalUpdateSchema } from '@farm/contracts';
import type { Prisma, Animal } from '@prisma/client';
import type { RequestUser } from '../common/types';
import type { SyncMutation } from '@farm/contracts';

export type ApplyOutcome =
  | { status: 'applied'; serverVersion: number; snapshot: Record<string, unknown> | null }
  | { status: 'conflict'; current: Record<string, unknown> | null }
  | { status: 'failed'; error: string };

/** Applies animal create/update/delete mutations inside a sync transaction. */
@Injectable()
export class AnimalApplier {
  async apply(
    tx: Prisma.TransactionClient,
    user: RequestUser,
    mutation: SyncMutation,
  ): Promise<ApplyOutcome> {
    switch (mutation.op) {
      case 'create':
        return this.create(tx, user, mutation);
      case 'update':
        return this.update(tx, user, mutation);
      case 'delete':
        return this.remove(tx, user, mutation);
    }
  }

  private async create(
    tx: Prisma.TransactionClient,
    user: RequestUser,
    mutation: SyncMutation,
  ): Promise<ApplyOutcome> {
    if (!user.permissions.includes('animals:write')) {
      return { status: 'failed', error: 'PERMISSION_DENIED: animals:write' };
    }
    const parsed = animalCreateSchema.safeParse(mutation.payload);
    if (!parsed.success) {
      return { status: 'failed', error: `VALIDATION_ERROR: ${parsed.error.issues[0]?.message}` };
    }

    const existing = await tx.animal.findUnique({ where: { id: mutation.entityId } });
    if (existing) {
      // Same entity created by a different mutation: surface as conflict.
      return { status: 'conflict', current: toSnapshot(existing) };
    }

    const tagTaken = await tx.animal.findUnique({
      where: { farmId_tag: { farmId: user.farmId, tag: parsed.data.tag } },
    });
    if (tagTaken) {
      return { status: 'conflict', current: toSnapshot(tagTaken) };
    }

    const created = await tx.animal.create({
      data: {
        id: mutation.entityId,
        farmId: user.farmId,
        tag: parsed.data.tag,
        name: parsed.data.name,
        species: parsed.data.species,
        breed: parsed.data.breed,
        dateOfBirth: parsed.data.dateOfBirth,
        gender: parsed.data.gender,
        color: parsed.data.color,
        source: parsed.data.source,
        motherTag: parsed.data.motherTag,
        purchaseDate: parsed.data.purchaseDate,
        purchaseCost: parsed.data.purchaseCost,
        status: parsed.data.status,
        breedingStock: parsed.data.breedingStock ?? true,
        notes: parsed.data.notes,
        version: 1,
      },
    });
    if (parsed.data.initialWeightKg !== undefined) {
      await tx.weightRecord.create({
        data: {
          farmId: user.farmId,
          animalId: created.id,
          weightKg: parsed.data.initialWeightKg,
          recordedAt: mutation.occurredAt,
        },
      });
    }
    return { status: 'applied', serverVersion: 1, snapshot: toSnapshot(created) };
  }

  private async update(
    tx: Prisma.TransactionClient,
    user: RequestUser,
    mutation: SyncMutation,
  ): Promise<ApplyOutcome> {
    if (!user.permissions.includes('animals:write')) {
      return { status: 'failed', error: 'PERMISSION_DENIED: animals:write' };
    }
    const current = await tx.animal.findFirst({
      where: { id: mutation.entityId, farmId: user.farmId },
    });
    if (!current) return { status: 'failed', error: 'NOT_FOUND: animal' };
    if (current.deletedAt) return { status: 'conflict', current: null };
    if (mutation.baseVersion !== undefined && mutation.baseVersion !== current.version) {
      return { status: 'conflict', current: toSnapshot(current) };
    }

    const parsed = animalUpdateSchema.safeParse(mutation.payload);
    if (!parsed.success) {
      return { status: 'failed', error: `VALIDATION_ERROR: ${parsed.error.issues[0]?.message}` };
    }

    const updated = await tx.animal.update({
      where: { id: current.id },
      data: { ...parsed.data, version: current.version + 1 },
    });
    return {
      status: 'applied',
      serverVersion: updated.version,
      snapshot: toSnapshot(updated),
    };
  }

  private async remove(
    tx: Prisma.TransactionClient,
    user: RequestUser,
    mutation: SyncMutation,
  ): Promise<ApplyOutcome> {
    if (!user.permissions.includes('animals:delete')) {
      return { status: 'failed', error: 'PERMISSION_DENIED: animals:delete' };
    }
    const current = await tx.animal.findFirst({
      where: { id: mutation.entityId, farmId: user.farmId },
    });
    if (!current) return { status: 'failed', error: 'NOT_FOUND: animal' };
    if (current.deletedAt) {
      return { status: 'applied', serverVersion: current.version, snapshot: null };
    }
    if (mutation.baseVersion !== undefined && mutation.baseVersion !== current.version) {
      return { status: 'conflict', current: toSnapshot(current) };
    }

    const deleted = await tx.animal.update({
      where: { id: current.id },
      data: { deletedAt: new Date(), version: current.version + 1 },
    });
    return { status: 'applied', serverVersion: deleted.version, snapshot: null };
  }
}

export function toSnapshot(animal: Animal): Record<string, unknown> {
  return {
    id: animal.id,
    farmId: animal.farmId,
    tag: animal.tag,
    name: animal.name,
    species: animal.species,
    breed: animal.breed,
    dateOfBirth: animal.dateOfBirth?.toISOString() ?? null,
    gender: animal.gender,
    color: animal.color,
    source: animal.source,
    motherTag: animal.motherTag,
    purchaseDate: animal.purchaseDate?.toISOString() ?? null,
    purchaseCost: animal.purchaseCost ? Number(animal.purchaseCost) : null,
    status: animal.status,
    breedingStock: animal.breedingStock,
    notes: animal.notes,
    version: animal.version,
    createdAt: animal.createdAt.toISOString(),
    updatedAt: animal.updatedAt.toISOString(),
    deletedAt: animal.deletedAt?.toISOString() ?? null,
  };
}
