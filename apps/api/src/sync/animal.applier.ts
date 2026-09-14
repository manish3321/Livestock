import { Injectable } from '@nestjs/common';
import { animalCreateSchema, animalUpdateSchema, type Species, type SyncMutation } from '@farm/contracts';
import type { Prisma, Animal } from '@prisma/client';
import type { RequestUser } from '../common/types';
import { HerdNumberService } from '../herd-number/herd-number.service';
import { ensureTask } from '../jobs/task-writer';
import { nextPrintableTag } from '../animals/tag-rules';

export type ApplyOutcome =
  | { status: 'applied'; serverVersion: number; snapshot: Record<string, unknown> | null }
  | { status: 'conflict'; current: Record<string, unknown> | null }
  | { status: 'failed'; error: string };

/** Applies animal create/update/delete mutations inside a sync transaction. */
@Injectable()
export class AnimalApplier {
  private readonly herdNumbers = new HerdNumberService();

  async apply(
    tx: Prisma.TransactionClient,
    user: RequestUser,
    mutation: SyncMutation,
    deviceId?: string,
  ): Promise<ApplyOutcome> {
    switch (mutation.op) {
      case 'create':
        return this.create(tx, user, mutation, deviceId);
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
    deviceId?: string,
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
      return { status: 'conflict', current: toSnapshot(existing) };
    }

    const tag = await this.uniqueTag(tx, user.farmId, parsed.data.tag, mutation.entityId);
    const herdNumber = await this.assignHerdNumber(
      tx,
      user.farmId,
      parsed.data.species,
      deviceId,
      mutation.payload,
    );

    const created = await tx.animal.create({
      data: {
        id: mutation.entityId,
        farmId: user.farmId,
        tag: tag.value,
        herdNumber,
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
    if (tag.renamed) {
      await ensureTask(tx, {
        farmId: user.farmId,
        type: 'RETAG_REQUIRED',
        titleEn: `Reprint tag for ${created.herdNumber ?? created.tag}`,
        titleNp: `${created.herdNumber ?? created.tag} को ट्याग फेरि छाप्नुहोस्`,
        dueAt: new Date(),
        priority: 'HIGH',
        animalId: created.id,
        sourceRefType: 'sync',
        sourceRefId: mutation.clientMutationId,
      });
    }
    return { status: 'applied', serverVersion: 1, snapshot: toSnapshot(created) };
  }

  /**
   * Guardrail 2.5: a tag collision never drops the farmer's record.
   * Keep both animals; renumber the second and raise a reprint task.
   */
  private async uniqueTag(
    tx: Prisma.TransactionClient,
    farmId: string,
    requested: string,
    entityId: string,
  ): Promise<{ value: string; renamed: boolean }> {
    let candidate = requested;
    let renamed = false;
    for (let i = 0; i < 50; i += 1) {
      const taken = await tx.animal.findUnique({
        where: { farmId_tag: { farmId, tag: candidate } },
      });
      if (!taken || taken.id === entityId || taken.deletedAt) {
        return { value: candidate, renamed };
      }
      const next = nextPrintableTag(candidate);
      if (!next) break;
      candidate = next;
      renamed = true;
    }
    return { value: candidate, renamed };
  }

  private async assignHerdNumber(
    tx: Prisma.TransactionClient,
    farmId: string,
    species: Species,
    deviceId: string | undefined,
    payload: Record<string, unknown> | undefined,
  ): Promise<string> {
    const requested = typeof payload?.herdNumber === 'string' ? payload.herdNumber : undefined;
    if (requested && deviceId) {
      const owned = await this.herdNumbers.consumeIfOwned(tx, farmId, species, deviceId, requested);
      const clash = await tx.animal.findFirst({
        where: { farmId, herdNumber: requested, deletedAt: null },
      });
      if (owned && !clash) return requested;
    }
    return this.herdNumbers.issue(tx, farmId, species);
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
    herdNumber: animal.herdNumber,
    name: animal.name,
    species: animal.species,
    breed: animal.breed,
    dateOfBirth: animal.dateOfBirth?.toISOString() ?? null,
    dobIsEstimated: animal.dobIsEstimated,
    ageAtAcquisitionMonths: animal.ageAtAcquisitionMonths,
    gender: animal.gender,
    color: animal.color,
    source: animal.source,
    motherTag: animal.motherTag,
    purchaseDate: animal.purchaseDate?.toISOString() ?? null,
    purchaseCost: animal.purchaseCost ? Number(animal.purchaseCost) : null,
    status: animal.status,
    isPregnant: animal.isPregnant,
    pregnancyConfirmedDate: animal.pregnancyConfirmedDate?.toISOString() ?? null,
    expectedCalvingDate: animal.expectedCalvingDate?.toISOString() ?? null,
    lactationNumber: animal.lactationNumber,
    lactationStartDate: animal.lactationStartDate?.toISOString() ?? null,
    expectedLactationDays: animal.expectedLactationDays,
    breedComposition: animal.breedComposition ?? null,
    breedingStock: animal.breedingStock,
    notes: animal.notes,
    version: animal.version,
    createdAt: animal.createdAt.toISOString(),
    updatedAt: animal.updatedAt.toISOString(),
    deletedAt: animal.deletedAt?.toISOString() ?? null,
  };
}
