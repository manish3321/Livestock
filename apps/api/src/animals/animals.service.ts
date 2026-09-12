import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AnimalCreate,
  AnimalDetailDto,
  AnimalDto,
  AnimalEconomicsDto,
  AnimalImportCommit,
  AnimalImportPreviewRow,
  AnimalListQuery,
  AnimalUpdate,
  MarkerPlace,
  PageResult,
  TagReplace,
  WeightCreate,
  WeightRecordDto,
} from '@farm/contracts';
import { DEFAULT_MARKER_SCHEME, animalImportRowSchema } from '@farm/contracts';
import { MIN_DAM_AGE_GAP_MONTHS, type AnimalStatusHistoryDto, type BreedComposition, type Species } from '@farm/contracts';
import { Prisma, type Animal, type AnimalStatusHistory, type WeightRecord } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { RequestUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { HerdNumberService } from '../herd-number/herd-number.service';
import { SpeciesConfigService } from '../species-config/species-config.service';
import { toSnapshot } from '../sync/animal.applier';
import { ensureTask } from '../jobs/task-writer';

const MONTH_MS = 30.44 * 24 * 60 * 60 * 1000;

@Injectable()
export class AnimalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly speciesConfig: SpeciesConfigService,
    private readonly herdNumbers: HerdNumberService,
  ) {}

  async list(
    user: RequestUser,
    query: AnimalListQuery,
  ): Promise<PageResult<AnimalDto>> {
    const where = {
      farmId: user.farmId,
      deletedAt: null,
      ...(query.species ? { species: query.species } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.gender ? { gender: query.gender } : {}),
      ...(query.shed ? { shed: query.shed } : {}),
      ...(query.q
        ? {
            OR: [
              { tag: { contains: query.q, mode: 'insensitive' as const } },
              { herdNumber: { contains: query.q, mode: 'insensitive' as const } },
              { name: { contains: query.q, mode: 'insensitive' as const } },
              { breed: { contains: query.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.animal.findMany({
        where,
        orderBy: { [query.sort]: query.order },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          weights: { orderBy: { recordedAt: 'desc' }, take: 1 },
          dam: { select: { tag: true } },
          sire: { select: { tag: true } },
        },
      }),
      this.prisma.animal.count({ where }),
    ]);

    return {
      items: rows.map((a) => toDto(a, a.weights[0] ?? null)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async get(user: RequestUser, id: string): Promise<AnimalDetailDto> {
    const animal = await this.prisma.animal.findFirst({
      where: { id, farmId: user.farmId, deletedAt: null },
      include: {
        weights: { orderBy: { recordedAt: 'desc' } },
        dam: { select: { tag: true } },
        sire: { select: { tag: true } },
        statusHistory: { orderBy: { changedAt: 'desc' } },
      },
    });
    if (!animal) {
      throw new NotFoundException({ code: 'ANIMAL_NOT_FOUND', message: 'Animal not found' });
    }
    return {
      ...toDto(animal, animal.weights[0] ?? null),
      weights: animal.weights.map(toWeightDto),
      statusHistory: animal.statusHistory.map(toStatusHistoryDto),
    };
  }

  async productionStats(
    user: RequestUser,
    id: string,
  ): Promise<import('@farm/contracts').AnimalProductionStatsDto> {
    await this.requireAnimal(user.farmId, id);
    const from = new Date();
    from.setUTCDate(from.getUTCDate() - 30);

    const [mine, herd] = await Promise.all([
      this.prisma.productionEntry.findMany({
        where: { farmId: user.farmId, animalId: id, type: 'MILK' },
        orderBy: { entryDate: 'asc' },
      }),
      this.prisma.productionEntry.aggregate({
        where: { farmId: user.farmId, type: 'MILK', animalId: { not: null } },
        _avg: { quantity: true },
      }),
    ]);
    const last30 = mine.filter((r) => r.entryDate >= from);
    const milkTotalLiters = mine.reduce((s, r) => s + Number(r.quantity), 0);
    return {
      animalId: id,
      milkEntryCount: mine.length,
      milkTotalLiters,
      milkAverage: mine.length ? milkTotalLiters / mine.length : 0,
      herdAverage: herd._avg.quantity ? Number(herd._avg.quantity) : 0,
      last30Days: last30.map((r) => ({
        date: r.entryDate.toISOString(),
        quantity: Number(r.quantity),
        fatPercent: r.fatPercent != null ? Number(r.fatPercent) : null,
        scc: r.scc,
      })),
    };
  }

  async uploadPhoto(
    user: RequestUser,
    id: string,
    file: { buffer: Buffer; originalname: string; mimetype: string },
    storage: import('../storage/storage.port').StoragePort,
    requestId?: string,
  ) {
    await this.requireAnimal(user.farmId, id);
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `animals/${user.farmId}/${id}-${safeName}`;
    await storage.put(key, file.buffer, file.mimetype || 'application/octet-stream');
    const photoUrl = `/v1/animals/${id}/photo`;
    await this.prisma.animal.update({
      where: { id },
      data: { photoStorageKey: key, photoUrl },
    });
    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'animals.photo',
      entityType: 'animal',
      entityId: id,
      metadata: { key },
      requestId,
    });
    return this.get(user, id);
  }

  async getPhotoBuffer(user: RequestUser, id: string, storage: import('../storage/storage.port').StoragePort) {
    const animal = await this.requireAnimal(user.farmId, id);
    if (!animal.photoStorageKey) {
      throw new NotFoundException({
        code: 'PHOTO_NOT_FOUND',
        message: 'No photo uploaded for this animal',
      });
    }
    const buffer = await storage.get(animal.photoStorageKey);
    const filename = animal.photoStorageKey.split('/').pop() ?? 'photo';
    return { buffer, filename };
  }

  async create(
    user: RequestUser,
    input: AnimalCreate,
    requestId?: string,
  ): Promise<AnimalDetailDto> {
    const tagTaken = await this.prisma.animal.findUnique({
      where: { farmId_tag: { farmId: user.farmId, tag: input.tag } },
    });
    if (tagTaken && !tagTaken.deletedAt) {
      throw new ConflictException({
        code: 'TAG_TAKEN',
        message: `Tag ${input.tag} is already in use`,
      });
    }

    const { initialWeightKg, ...data } = input;
    await this.validateParents(user.farmId, data.damId, data.sireId, data.dateOfBirth);

    // A DOB the farmer could not supply is derived from age at acquisition, and
    // flagged so nothing downstream presents a guess as a known date.
    const { dateOfBirth, dobIsEstimated } = resolveDateOfBirth(data);
    const { lactationDays } = await this.speciesConfig.forSpecies(data.species as Species);

    const animal = await this.prisma.$transaction(async (tx) => {
      const herdNumber = await this.herdNumbers.issue(tx, user.farmId, data.species as Species);
      const created = await tx.animal.create({
        data: {
          farmId: user.farmId,
          tag: data.tag,
          herdNumber,
          name: data.name,
          species: data.species,
          breed: data.breed,
          dateOfBirth,
          dobIsEstimated,
          ageAtAcquisitionMonths: data.ageAtAcquisitionMonths,
          gender: data.gender,
          color: data.color,
          source: data.source,
          motherTag: data.motherTag,
          purchaseDate: data.purchaseDate,
          purchaseCost: data.purchaseCost,
          sellerName: data.sellerName,
          distinguishingMarks: data.distinguishingMarks,
          status: data.status,
          isPregnant: data.isPregnant ?? false,
          pregnancyConfirmedDate: data.pregnancyConfirmedDate,
          expectedCalvingDate: data.expectedCalvingDate,
          lactationNumber: data.lactationNumber ?? 0,
          lactationStartDate: data.lactationStartDate,
          expectedLactationDays: lactationDays,
          breedComposition: data.breedComposition ?? Prisma.DbNull,
          breedingStock: data.breedingStock ?? true,
          shed: data.shed,
          damId: data.damId,
          sireId: data.sireId,
          notes: data.notes,
          version: 1,
        },
      });

      await tx.animalTag.create({
        data: {
          farmId: user.farmId,
          animalId: created.id,
          herdNumber,
          fullTag: created.tag,
          reason: 'ISSUED',
        },
      });

      // Opens the trail, so the first status has a recorded origin too.
      await tx.animalStatusHistory.create({
        data: {
          farmId: user.farmId,
          animalId: created.id,
          fromStatus: null,
          toStatus: created.status,
          reason: 'Registered',
          changedBy: user.id,
        },
      });

      if (initialWeightKg !== undefined) {
        await tx.weightRecord.create({
          data: {
            farmId: user.farmId,
            animalId: created.id,
            weightKg: initialWeightKg,
            recordedAt: new Date(),
          },
        });
      }

      await tx.changeLogEntry.create({
        data: {
          farmId: user.farmId,
          entityType: 'animal',
          entityId: created.id,
          version: 1,
          data: toSnapshot(created) as never,
        },
      });

      return created;
    });

    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'animals.create',
      entityType: 'animal',
      entityId: animal.id,
      metadata: { tag: animal.tag },
      requestId,
    });

    return this.get(user, animal.id);
  }

  async update(
    user: RequestUser,
    id: string,
    input: AnimalUpdate,
    requestId?: string,
  ): Promise<AnimalDetailDto> {
    const current = await this.requireAnimal(user.farmId, id);

    if (input.tag && input.tag !== current.tag) {
      const tagTaken = await this.prisma.animal.findUnique({
        where: { farmId_tag: { farmId: user.farmId, tag: input.tag } },
      });
      if (tagTaken && tagTaken.id !== id && !tagTaken.deletedAt) {
        throw new ConflictException({
          code: 'TAG_TAKEN',
          message: `Tag ${input.tag} is already in use`,
        });
      }
    }

    await this.validateParents(
      user.farmId,
      input.damId ?? current.damId ?? undefined,
      input.sireId ?? current.sireId ?? undefined,
      input.dateOfBirth ?? current.dateOfBirth ?? undefined,
      id,
    );

    const { breedComposition, ...rest } = input;
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.animal.update({
        where: { id },
        data: {
          ...rest,
          ...(breedComposition !== undefined
            ? { breedComposition: breedComposition ?? Prisma.DbNull }
            : {}),
          version: current.version + 1,
        },
      });

      // Never overwrite a status silently — the trail is how "why is she marked
      // DRY" stays answerable months later.
      if (input.status !== undefined && input.status !== current.status) {
        await tx.animalStatusHistory.create({
          data: {
            farmId: user.farmId,
            animalId: row.id,
            fromStatus: current.status,
            toStatus: row.status,
            changedBy: user.id,
          },
        });
      }

      await tx.changeLogEntry.create({
        data: {
          farmId: user.farmId,
          entityType: 'animal',
          entityId: row.id,
          version: row.version,
          data: toSnapshot(row) as never,
        },
      });
      return row;
    });

    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'animals.update',
      entityType: 'animal',
      entityId: updated.id,
      requestId,
    });

    return this.get(user, updated.id);
  }

  async remove(user: RequestUser, id: string, requestId?: string): Promise<void> {
    const current = await this.requireAnimal(user.farmId, id);
    await this.prisma.$transaction(async (tx) => {
      const deleted = await tx.animal.update({
        where: { id },
        data: { deletedAt: new Date(), version: current.version + 1 },
      });
      await tx.changeLogEntry.create({
        data: {
          farmId: user.farmId,
          entityType: 'animal',
          entityId: deleted.id,
          version: deleted.version,
          deletedAt: deleted.deletedAt,
          data: Prisma.DbNull,
        },
      });
    });

    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'animals.delete',
      entityType: 'animal',
      entityId: id,
      requestId,
    });
  }

  async addWeight(
    user: RequestUser,
    animalId: string,
    input: WeightCreate,
    requestId?: string,
  ): Promise<WeightRecordDto> {
    await this.requireAnimal(user.farmId, animalId);
    const record = await this.prisma.weightRecord.create({
      data: {
        farmId: user.farmId,
        animalId,
        weightKg: input.weightKg,
        bcs: input.bcs,
        recordedAt: input.recordedAt,
        notes: input.notes,
      },
    });

    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'animals.weight.add',
      entityType: 'animal',
      entityId: animalId,
      metadata: { weightKg: input.weightKg },
      requestId,
    });

    return toWeightDto(record);
  }

  async economics(user: RequestUser, id: string): Promise<AnimalEconomicsDto> {
    const animal = await this.requireAnimal(user.farmId, id);

    const [expenseAgg, allocationAgg, revenueAgg, healthAgg] = await Promise.all([
      this.prisma.expense.aggregate({
        where: { farmId: user.farmId, animalId: id, allocations: { none: {} } },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.expenseAllocation.aggregate({
        where: { farmId: user.farmId, animalId: id },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.revenue.aggregate({
        where: { farmId: user.farmId, animalId: id },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.healthRecord.aggregate({
        where: { farmId: user.farmId, animalId: id },
        _sum: { cost: true },
        _count: true,
      }),
    ]);

    const purchaseCost = animal.purchaseCost ? Number(animal.purchaseCost) : 0;
    const expenseTotal =
      (expenseAgg._sum.amount ? Number(expenseAgg._sum.amount) : 0) +
      (allocationAgg._sum.amount ? Number(allocationAgg._sum.amount) : 0);
    const healthCostTotal = healthAgg._sum.cost ? Number(healthAgg._sum.cost) : 0;
    const revenueTotal = revenueAgg._sum.amount ? Number(revenueAgg._sum.amount) : 0;
    const investedTotal = purchaseCost + expenseTotal + healthCostTotal;
    const earnedTotal = revenueTotal;

    return {
      animalId: animal.id,
      tag: animal.tag,
      name: animal.name,
      species: animal.species,
      breedingStock: animal.breedingStock,
      purchaseCost,
      expenseTotal,
      healthCostTotal,
      investedTotal,
      revenueTotal,
      earnedTotal,
      net: earnedTotal - investedTotal,
      expenseCount: expenseAgg._count + allocationAgg._count,
      revenueCount: revenueAgg._count,
      healthCount: healthAgg._count,
    };
  }

  async exportCsv(user: RequestUser): Promise<string> {
    const animals = await this.prisma.animal.findMany({
      where: { farmId: user.farmId, deletedAt: null },
      orderBy: { tag: 'asc' },
      include: { weights: { orderBy: { recordedAt: 'desc' }, take: 1 } },
    });

    const header = [
      'tag',
      'name',
      'species',
      'breed',
      'gender',
      'status',
      'color',
      'source',
      'motherTag',
      'dateOfBirth',
      'purchaseDate',
      'purchaseCost',
      'breedingStock',
      'currentWeightKg',
      'notes',
    ].join(',');

    const lines = animals.map((a) =>
      [
        a.tag,
        csv(a.name),
        a.species,
        csv(a.breed),
        a.gender,
        a.status,
        csv(a.color),
        a.source ?? '',
        csv(a.motherTag),
        a.dateOfBirth?.toISOString().slice(0, 10) ?? '',
        a.purchaseDate?.toISOString().slice(0, 10) ?? '',
        a.purchaseCost ? Number(a.purchaseCost) : '',
        a.breedingStock ? 'yes' : 'no',
        a.weights[0] ? Number(a.weights[0].weightKg) : '',
        csv(a.notes),
      ].join(','),
    );

    return [header, ...lines].join('\n');
  }

  private async requireAnimal(farmId: string, id: string): Promise<Animal> {
    const animal = await this.prisma.animal.findFirst({
      where: { id, farmId, deletedAt: null },
    });
    if (!animal) {
      throw new NotFoundException({ code: 'ANIMAL_NOT_FOUND', message: 'Animal not found' });
    }
    return animal;
  }

  /**
   * A dam must be female and old enough to have actually borne the offspring.
   * These checks need the parent rows, so they live here rather than in the Zod
   * schema. Sire must be male for the same reason.
   */
  private async validateParents(
    farmId: string,
    damId: string | undefined,
    sireId: string | undefined,
    dateOfBirth: Date | undefined,
    selfId?: string,
  ): Promise<void> {
    if (damId && damId === selfId) {
      throw new BadRequestException({
        code: 'INVALID_DAM',
        message: 'An animal cannot be its own dam',
      });
    }
    if (sireId && sireId === selfId) {
      throw new BadRequestException({
        code: 'INVALID_SIRE',
        message: 'An animal cannot be its own sire',
      });
    }

    if (damId) {
      const dam = await this.prisma.animal.findFirst({
        where: { id: damId, farmId, deletedAt: null },
      });
      if (!dam) {
        throw new BadRequestException({ code: 'INVALID_DAM', message: 'Dam not found' });
      }
      if (dam.gender !== 'FEMALE') {
        throw new BadRequestException({
          code: 'INVALID_DAM',
          message: 'Dam must be female',
        });
      }
      // Only checkable when both dates are known; an unknown DOB must not block
      // registration, so a missing date skips the check rather than failing it.
      if (dateOfBirth && dam.dateOfBirth) {
        const gapMonths = (dateOfBirth.getTime() - dam.dateOfBirth.getTime()) / MONTH_MS;
        if (gapMonths < MIN_DAM_AGE_GAP_MONTHS) {
          throw new BadRequestException({
            code: 'INVALID_DAM',
            message: `Dam must be at least ${MIN_DAM_AGE_GAP_MONTHS} months older than her offspring`,
          });
        }
      }
    }

    if (sireId) {
      const sire = await this.prisma.animal.findFirst({
        where: { id: sireId, farmId, deletedAt: null },
      });
      if (!sire) {
        throw new BadRequestException({ code: 'INVALID_SIRE', message: 'Sire not found' });
      }
      if (sire.gender !== 'MALE') {
        throw new BadRequestException({
          code: 'INVALID_SIRE',
          message: 'Sire must be male',
        });
      }
    }
  }

  previewImport(csvText: string): AnimalImportPreviewRow[] {
    const lines = csvText.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length === 0) return [];
    const header = splitCsvLine(lines[0]!).map((h) => h.trim().toLowerCase());
    return lines.slice(1).map((line, i) => {
      const cells = splitCsvLine(line);
      const raw: Record<string, string> = {};
      header.forEach((h, idx) => {
        raw[h] = cells[idx]?.trim() ?? '';
      });
      const parsed = animalImportRowSchema.safeParse({
        tag: raw.tag,
        name: raw.name || undefined,
        species: raw.species?.toUpperCase(),
        breed: raw.breed,
        gender: raw.gender?.toUpperCase(),
        status: raw.status?.toUpperCase() || undefined,
        source: raw.source?.toUpperCase() || undefined,
        shed: raw.shed || undefined,
        sellerName: raw.sellername || raw.seller || undefined,
        dateOfBirth: raw.dateofbirth || raw.dob || undefined,
        ageAtAcquisitionMonths: raw.ageatacquisitionmonths || raw.age || undefined,
        purchaseCost: raw.purchasecost || raw.price || undefined,
      });
      if (!parsed.success) {
        return {
          row: i + 2,
          data: null,
          errors: parsed.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`),
        };
      }
      return { row: i + 2, data: parsed.data, errors: [] };
    });
  }

  async commitImport(
    user: RequestUser,
    input: AnimalImportCommit,
    requestId?: string,
  ): Promise<{ created: number; errors: AnimalImportPreviewRow[] }> {
    const errors: AnimalImportPreviewRow[] = [];
    let created = 0;
    for (const [i, row] of input.rows.entries()) {
      try {
        await this.create(
          user,
          {
            tag: row.tag,
            name: row.name,
            species: row.species,
            breed: row.breed,
            gender: row.gender,
            status: row.status ?? 'ACTIVE',
            source: row.source,
            shed: row.shed,
            sellerName: row.sellerName,
            dateOfBirth: row.dateOfBirth,
            ageAtAcquisitionMonths: row.ageAtAcquisitionMonths,
            purchaseCost: row.purchaseCost,
          },
          requestId,
        );
        created += 1;
      } catch (err) {
        errors.push({
          row: i + 1,
          data: row,
          errors: [err instanceof Error ? err.message : 'Could not create'],
        });
      }
    }
    return { created, errors };
  }

  async replaceTag(user: RequestUser, id: string, input: TagReplace, requestId?: string) {
    const animal = await this.prisma.animal.findFirst({
      where: { id, farmId: user.farmId, deletedAt: null },
    });
    if (!animal || !animal.herdNumber) {
      throw new NotFoundException({ code: 'ANIMAL_NOT_FOUND', message: 'Animal not found' });
    }
    const fullTag = input.fullTag ?? animal.tag;
    await this.prisma.animalTag.updateMany({
      where: { animalId: animal.id, replacedAt: null },
      data: { replacedAt: new Date(), reason: input.reason },
    });
    await this.prisma.animalTag.create({
      data: {
        farmId: user.farmId,
        animalId: animal.id,
        herdNumber: animal.herdNumber,
        fullTag,
        reason: 'ISSUED',
      },
    });
    if (fullTag !== animal.tag) {
      await this.prisma.animal.update({ where: { id: animal.id }, data: { tag: fullTag } });
    }
    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'animal.retag',
      entityType: 'animal',
      entityId: animal.id,
      metadata: { reason: input.reason, herdNumber: animal.herdNumber },
      requestId,
    });
    return this.get(user, animal.id);
  }

  async printTags(user: RequestUser, ids?: string[]) {
    const animals = await this.prisma.animal.findMany({
      where: {
        farmId: user.farmId,
        deletedAt: null,
        ...(ids?.length ? { id: { in: ids } } : {}),
      },
      orderBy: { herdNumber: 'asc' },
    });
    return animals.map((a) => ({
      id: a.id,
      herdNumber: a.herdNumber,
      tag: a.tag,
      name: a.name,
      species: a.species,
      qrPath: `/scan/a/${a.id}`,
    }));
  }

  async placeMarker(user: RequestUser, input: MarkerPlace, requestId?: string) {
    if (!input.byScan) {
      throw new BadRequestException({
        code: 'SCAN_REQUIRED',
        message: 'Placing a band requires a scan so the record matches the ear',
      });
    }
    const animal = await this.prisma.animal.findFirst({
      where: { id: input.animalId, farmId: user.farmId, deletedAt: null },
    });
    if (!animal) {
      throw new NotFoundException({ code: 'ANIMAL_NOT_FOUND', message: 'Animal not found' });
    }
    const color = DEFAULT_MARKER_SCHEME[input.meaning];
    const marker = await this.prisma.animalMarker.create({
      data: {
        farmId: user.farmId,
        animalId: animal.id,
        color,
        meaning: input.meaning,
        placedById: user.id,
        placedByScan: true,
      },
    });
    await ensureTask(this.prisma, {
      farmId: user.farmId,
      animalId: animal.id,
      type: 'REMOVE_MARKER',
      titleEn: `Remove ${color} band from ${animal.herdNumber ?? animal.tag}`,
      titleNp: `${animal.herdNumber ?? animal.tag} बाट ${color} ब्यान्ड हटाउनुहोस्`,
      dueAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      priority: 'NORMAL',
      sourceRefType: 'animalMarker',
      sourceRefId: marker.id,
    });
    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'animal.marker.place',
      entityType: 'animalMarker',
      entityId: marker.id,
      requestId,
    });
    return marker;
  }

  async removeMarker(user: RequestUser, markerId: string, byScan: boolean, requestId?: string) {
    if (!byScan) {
      throw new BadRequestException({
        code: 'SCAN_REQUIRED',
        message: 'Removing a band requires a scan',
      });
    }
    const marker = await this.prisma.animalMarker.findFirst({
      where: { id: markerId, farmId: user.farmId, removedAt: null },
    });
    if (!marker) {
      throw new NotFoundException({ code: 'MARKER_NOT_FOUND', message: 'Marker not found' });
    }
    await this.prisma.animalMarker.update({
      where: { id: marker.id },
      data: { removedAt: new Date(), removedById: user.id, removedByScan: true },
    });
    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'animal.marker.remove',
      entityType: 'animalMarker',
      entityId: marker.id,
      requestId,
    });
    return { ok: true };
  }
}

/**
 * Works out a usable date of birth. When the farmer knows it, that date is
 * used as-is. When they only know roughly how old the animal was when bought,
 * a DOB is derived from that and marked estimated. Registration is never
 * blocked for want of a birth date.
 */
function resolveDateOfBirth(data: {
  dateOfBirth?: Date;
  dobIsEstimated?: boolean;
  ageAtAcquisitionMonths?: number;
  purchaseDate?: Date;
}): { dateOfBirth: Date | undefined; dobIsEstimated: boolean } {
  if (data.dateOfBirth) {
    return { dateOfBirth: data.dateOfBirth, dobIsEstimated: data.dobIsEstimated ?? false };
  }
  if (data.ageAtAcquisitionMonths !== undefined) {
    const from = data.purchaseDate ?? new Date();
    const derived = new Date(from.getTime() - data.ageAtAcquisitionMonths * MONTH_MS);
    return { dateOfBirth: derived, dobIsEstimated: true };
  }
  // Nothing to go on. Still a valid animal; age-based figures simply cannot be
  // computed for her until someone fills this in.
  return { dateOfBirth: undefined, dobIsEstimated: true };
}

function toDto(
  animal: Animal & { dam?: { tag: string } | null; sire?: { tag: string } | null },
  latestWeight: WeightRecord | null,
): AnimalDto {
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
    sellerName: animal.sellerName,
    distinguishingMarks: animal.distinguishingMarks,
    status: animal.status,
    isPregnant: animal.isPregnant,
    pregnancyConfirmedDate: animal.pregnancyConfirmedDate?.toISOString() ?? null,
    expectedCalvingDate: animal.expectedCalvingDate?.toISOString() ?? null,
    lactationNumber: animal.lactationNumber,
    lactationStartDate: animal.lactationStartDate?.toISOString() ?? null,
    expectedLactationDays: animal.expectedLactationDays,
    breedComposition: (animal.breedComposition as BreedComposition | null) ?? null,
    breedingStock: animal.breedingStock,
    shed: animal.shed,
    photoUrl: animal.photoUrl,
    damId: animal.damId,
    sireId: animal.sireId,
    damTag: animal.dam?.tag ?? null,
    sireTag: animal.sire?.tag ?? null,
    notes: animal.notes,
    currentWeightKg: latestWeight ? Number(latestWeight.weightKg) : null,
    version: animal.version,
    createdAt: animal.createdAt.toISOString(),
    updatedAt: animal.updatedAt.toISOString(),
    deletedAt: animal.deletedAt?.toISOString() ?? null,
  };
}

function toStatusHistoryDto(h: AnimalStatusHistory): AnimalStatusHistoryDto {
  return {
    id: h.id,
    animalId: h.animalId,
    fromStatus: h.fromStatus,
    toStatus: h.toStatus,
    reason: h.reason,
    changedAt: h.changedAt.toISOString(),
    changedBy: h.changedBy,
  };
}

function toWeightDto(w: WeightRecord): WeightRecordDto {
  return {
    id: w.id,
    animalId: w.animalId,
    weightKg: Number(w.weightKg),
    bcs: w.bcs,
    recordedAt: w.recordedAt.toISOString(),
    notes: w.notes,
    createdAt: w.createdAt.toISOString(),
  };
}

function csv(value: string | null | undefined): string {
  if (!value) return '';
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}
