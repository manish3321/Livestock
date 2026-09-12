import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  BreedingCreate,
  BreedingListQuery,
  BreedingUpdate,
  CalvingInput,
  ColostrumInput,
  PageResult,
  PregnancyCheck,
  Species,
} from '@farm/contracts';
import { HerdNumberService } from '../herd-number/herd-number.service';
import { ensureTask } from '../jobs/task-writer';
import type { Animal, BreedingRecord } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { RequestUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { SpeciesConfigService } from '../species-config/species-config.service';

export interface BreedingRecordDto {
  id: string;
  farmId: string;
  motherId: string;
  motherTag: string | null;
  matingType: string;
  fatherTagOrAi: string | null;
  matingDate: string;
  dueDate: string;
  pregnancyStatus: string;
  birthDate: string | null;
  offspringTag: string | null;
  offspringAnimalId: string | null;
  calvingDifficulty: string | null;
  colostrumFed: boolean | null;
  colostrumWithin4h: boolean | null;
  colostrumLiters: number | null;
  notes: string | null;
  daysRemaining: number | null;
  daysOpen: number | null;
  calvingIntervalDays: number | null;
  repeatBreeder: boolean;
  createdAt: string;
  updatedAt: string;
}

type BreedingWithMother = BreedingRecord & {
  mother?: Pick<Animal, 'tag'> | null;
};

@Injectable()
export class BreedingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly speciesConfig: SpeciesConfigService,
    private readonly herdNumbers: HerdNumberService,
  ) {}

  async list(
    user: RequestUser,
    query: BreedingListQuery,
  ): Promise<PageResult<BreedingRecordDto>> {
    const where = {
      farmId: user.farmId,
      ...(query.motherId ? { motherId: query.motherId } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.breedingRecord.findMany({
        where,
        include: { mother: { select: { tag: true } } },
        orderBy: { dueDate: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.breedingRecord.count({ where }),
    ]);
    const motherIds = [...new Set(rows.map((r) => r.motherId))];
    const history = motherIds.length
      ? await this.prisma.breedingRecord.findMany({
          where: { farmId: user.farmId, motherId: { in: motherIds } },
          select: {
            id: true,
            motherId: true,
            pregnancyStatus: true,
            matingDate: true,
            birthDate: true,
          },
          orderBy: { matingDate: 'asc' },
        })
      : [];
    const byMother = new Map<string, typeof history>();
    for (const h of history) {
      const list = byMother.get(h.motherId) ?? [];
      list.push(h);
      byMother.set(h.motherId, list);
    }

    return {
      items: rows.map((r) => toDto(r, byMother.get(r.motherId) ?? [])),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async create(
    user: RequestUser,
    input: BreedingCreate,
    requestId?: string,
  ): Promise<BreedingRecordDto> {
    const mother = await this.prisma.animal.findFirst({
      where: { id: input.motherId, farmId: user.farmId, deletedAt: null },
    });
    if (!mother) {
      throw new NotFoundException({
        code: 'ANIMAL_NOT_FOUND',
        message: 'Mother animal not found',
      });
    }

    const cfg = await this.speciesConfig.forSpecies(mother.species as Species);
    const dueDate = new Date(input.matingDate);
    dueDate.setDate(dueDate.getDate() + cfg.gestationDays);

    const row = await this.prisma.breedingRecord.create({
      data: {
        farmId: user.farmId,
        motherId: input.motherId,
        matingType: input.matingType,
        fatherTagOrAi: input.fatherTagOrAi,
        matingDate: input.matingDate,
        dueDate,
        pregnancyStatus: input.pregnancyStatus,
        notes: input.notes,
      },
      include: { mother: { select: { tag: true } } },
    });

    const since = mother.lactationStartDate ?? new Date(0);
    const serviceNo = await this.prisma.breedingRecord.count({
      where: {
        farmId: user.farmId,
        motherId: mother.id,
        matingDate: { gte: since },
      },
    });
    if (serviceNo >= 3) {
      await ensureTask(this.prisma, {
        farmId: user.farmId,
        animalId: mother.id,
        type: 'HEAT_WATCH',
        titleEn: `Repeat breeder ${mother.herdNumber ?? mother.tag} — service ${serviceNo}`,
        titleNp: `दोहोरिने प्रजनन ${mother.herdNumber ?? mother.tag} — सेवा ${serviceNo}`,
        dueAt: new Date(),
        priority: 'HIGH',
        sourceRefType: 'breedingRecord',
        sourceRefId: row.id,
      });
    }
    const pdDue = new Date(input.matingDate);
    pdDue.setDate(pdDue.getDate() + cfg.pregnancyCheckEarliestDays);
    await ensureTask(this.prisma, {
      farmId: user.farmId,
      animalId: mother.id,
      type: 'PREGNANCY_CHECK',
      titleEn: `Pregnancy check ${mother.herdNumber ?? mother.tag}`,
      titleNp: `${mother.herdNumber ?? mother.tag} को गर्भ जाँच`,
      dueAt: pdDue,
      priority: 'HIGH',
      sourceRefType: 'breedingRecord',
      sourceRefId: row.id,
    });

    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'breeding.create',
      entityType: 'breedingRecord',
      entityId: row.id,
      metadata: { species: mother.species, dueDate: dueDate.toISOString(), serviceNo },
      requestId,
    });

    return toDto(row);
  }

  async listHeat(user: RequestUser, query: import('@farm/contracts').HeatListQuery) {
    const where = {
      farmId: user.farmId,
      ...(query.animalId ? { animalId: query.animalId } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.heatLog.findMany({
        where,
        include: { animal: { select: { tag: true } } },
        orderBy: { observedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.heatLog.count({ where }),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        animalId: r.animalId,
        animalTag: r.animal?.tag ?? null,
        observedAt: r.observedAt.toISOString(),
        intensity: r.intensity,
        observerName: r.observerName,
        signs: r.signs,
        notes: r.notes,
        createdAt: r.createdAt.toISOString(),
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async logHeat(
    user: RequestUser,
    input: import('@farm/contracts').HeatCreate,
    requestId?: string,
  ) {
    const animal = await this.prisma.animal.findFirst({
      where: { id: input.animalId, farmId: user.farmId, deletedAt: null },
    });
    if (!animal) {
      throw new NotFoundException({
        code: 'ANIMAL_NOT_FOUND',
        message: 'Animal not found',
      });
    }
    const cfg = await this.speciesConfig.forSpecies(animal.species as Species);
    const label = animal.herdNumber ?? animal.tag;
    const tooSoonDays = daysUntilReady(animal.lactationStartDate, cfg.voluntaryWaitingDays);

    if (animal.isPregnant) {
      await ensureTask(this.prisma, {
        farmId: user.farmId,
        animalId: animal.id,
        type: 'PREGNANCY_CHECK',
        titleEn: `Heat on pregnant ${label} — possible loss`,
        titleNp: `गर्भवती ${label} मा रजस्वला — गर्भ जाँच`,
        dueAt: new Date(),
        priority: 'CRITICAL',
        sourceRefType: 'heatLog',
        sourceRefId: null,
      });
    }

    const row = await this.prisma.heatLog.create({
      data: {
        farmId: user.farmId,
        animalId: input.animalId,
        observedAt: input.observedAt,
        intensity: input.intensity,
        observerName: input.observerName,
        signs: input.signs,
        notes: input.notes,
      },
      include: { animal: { select: { tag: true } } },
    });

    const serviceWindowStart = new Date(input.observedAt.getTime() + 12 * 60 * 60 * 1000);
    const serviceWindowEnd = new Date(input.observedAt.getTime() + 18 * 60 * 60 * 1000);
    const nextHeatAt = new Date(input.observedAt);
    nextHeatAt.setDate(nextHeatAt.getDate() + cfg.estrusCycleDays);

    if (!animal.isPregnant) {
      const heatWatch = new Date(nextHeatAt);
      heatWatch.setDate(heatWatch.getDate() - 2);
      heatWatch.setHours(5, 0, 0, 0);
      await ensureTask(this.prisma, {
        farmId: user.farmId,
        animalId: animal.id,
        type: 'HEAT_WATCH',
        titleEn: `Heat watch ${label} — next heat around ${nextHeatAt.toISOString().slice(0, 10)}`,
        titleNp: `${label} को रजस्वला हेर्ने — अर्को ${nextHeatAt.toISOString().slice(0, 10)}`,
        dueAt: heatWatch,
        priority: 'HIGH',
        sourceRefType: 'heatLog',
        sourceRefId: row.id,
      });
      await ensureTask(this.prisma, {
        farmId: user.farmId,
        animalId: animal.id,
        type: 'SERVICE_WINDOW',
        titleEn: `Breed ${label} before ${serviceWindowEnd.toISOString().slice(11, 16)}`,
        titleNp: `${label} लाई ${serviceWindowEnd.toISOString().slice(11, 16)} अघि सेवा`,
        dueAt: serviceWindowStart,
        priority: 'HIGH',
        sourceRefType: 'heatLog',
        sourceRefId: row.id,
      });
    }

    const heatCount = await this.prisma.heatLog.count({
      where: { farmId: user.farmId, animalId: animal.id },
    });
    const serviceCount = await this.prisma.breedingRecord.count({
      where: { farmId: user.farmId, motherId: animal.id },
    });
    if (heatCount >= 3 && serviceCount === 0) {
      await ensureTask(this.prisma, {
        farmId: user.farmId,
        animalId: animal.id,
        type: 'HEAT_WATCH',
        titleEn: `${label} — three heats and no service`,
        titleNp: `${label} — तीन पटक रजस्वला, सेवा छैन`,
        dueAt: new Date(),
        priority: 'HIGH',
        sourceRefType: 'heatLog',
        sourceRefId: row.id,
      });
    }

    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'breeding.heat',
      entityType: 'heatLog',
      entityId: row.id,
      requestId,
    });
    return {
      id: row.id,
      animalId: row.animalId,
      animalTag: row.animal?.tag ?? null,
      observedAt: row.observedAt.toISOString(),
      intensity: row.intensity,
      observerName: row.observerName,
      signs: row.signs,
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
      nextHeatAt: nextHeatAt.toISOString(),
      serviceWindowStart: serviceWindowStart.toISOString(),
      serviceWindowEnd: serviceWindowEnd.toISOString(),
      tooSoonDays,
    };
  }

  async update(
    user: RequestUser,
    id: string,
    input: BreedingUpdate,
    requestId?: string,
  ): Promise<BreedingRecordDto> {
    const existing = await this.prisma.breedingRecord.findFirst({
      where: { id, farmId: user.farmId },
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'BREEDING_NOT_FOUND',
        message: 'Breeding record not found',
      });
    }

    const row = await this.prisma.breedingRecord.update({
      where: { id },
      data: {
        ...(input.pregnancyStatus !== undefined
          ? { pregnancyStatus: input.pregnancyStatus }
          : {}),
        ...(input.birthDate !== undefined ? { birthDate: input.birthDate } : {}),
        ...(input.offspringTag !== undefined ? { offspringTag: input.offspringTag } : {}),
        ...(input.offspringAnimalId !== undefined
          ? { offspringAnimalId: input.offspringAnimalId }
          : {}),
        ...(input.calvingDifficulty !== undefined
          ? { calvingDifficulty: input.calvingDifficulty }
          : {}),
        ...(input.colostrumFed !== undefined ? { colostrumFed: input.colostrumFed } : {}),
        ...(input.colostrumWithin4h !== undefined
          ? { colostrumWithin4h: input.colostrumWithin4h }
          : {}),
        ...(input.colostrumLiters !== undefined
          ? { colostrumLiters: input.colostrumLiters }
          : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.fatherTagOrAi !== undefined
          ? { fatherTagOrAi: input.fatherTagOrAi }
          : {}),
      },
      include: { mother: { select: { tag: true } } },
    });

    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'breeding.update',
      entityType: 'breedingRecord',
      entityId: row.id,
      requestId,
    });

    return toDto(row);
  }

  async recordCalving(user: RequestUser, id: string, input: CalvingInput, requestId?: string) {
    const rec = await this.prisma.breedingRecord.findFirst({
      where: { id, farmId: user.farmId },
      include: { mother: true },
    });
    if (!rec?.mother) {
      throw new NotFoundException({ code: 'BREEDING_NOT_FOUND', message: 'Breeding record not found' });
    }
    const mother = rec.mother;
    const cfg = await this.speciesConfig.forSpecies(mother.species as Species);
    const firstCalfId = await this.prisma.$transaction(async (tx) => {
      let offspringId: string | null = rec.offspringAnimalId;
      for (const calf of input.calves) {
        const herdNumber = await this.herdNumbers.issue(tx, user.farmId, mother.species as Species);
        const tag = `${herdNumber}`;
        const created = await tx.animal.create({
          data: {
            farmId: user.farmId,
            tag,
            herdNumber,
            name: calf.name,
            species: mother.species,
            breed: mother.breed,
            dateOfBirth: input.birthDate,
            gender: calf.sex,
            source: 'BORN',
            status: 'GROWING',
            damId: mother.id,
            motherTag: mother.tag,
            expectedLactationDays: cfg.lactationDays,
          },
        });
        await tx.animalTag.create({
          data: {
            farmId: user.farmId,
            animalId: created.id,
            herdNumber,
            fullTag: tag,
            reason: 'ISSUED',
          },
        });
        if (calf.weightKg) {
          await tx.weightRecord.create({
            data: {
              farmId: user.farmId,
              animalId: created.id,
              weightKg: calf.weightKg,
              recordedAt: input.birthDate,
            },
          });
        }
        if (!offspringId) offspringId = created.id;
      }

      await tx.animal.update({
        where: { id: mother.id },
        data: {
          status: 'LACTATING',
          isPregnant: false,
          lactationNumber: { increment: 1 },
          lactationStartDate: input.birthDate,
          expectedCalvingDate: null,
        },
      });
      await tx.animalStatusHistory.create({
        data: {
          farmId: user.farmId,
          animalId: mother.id,
          fromStatus: mother.status,
          toStatus: 'LACTATING',
          reason: 'Calved',
          changedBy: user.id,
        },
      });
      await tx.breedingRecord.update({
        where: { id: rec.id },
        data: {
          birthDate: input.birthDate,
          pregnancyStatus: 'DELIVERED',
          calvingDifficulty: input.difficulty,
          offspringAnimalId: offspringId,
          notes: [rec.notes, input.complications, input.placentaExpelled === false ? 'Placenta not expelled' : null]
            .filter(Boolean)
            .join('; '),
        },
      });
      return offspringId;
    });

    const label = mother.herdNumber ?? mother.tag;
    for (const hours of [2, 8, 16]) {
      await ensureTask(this.prisma, {
        farmId: user.farmId,
        animalId: firstCalfId,
        type: 'COLOSTRUM_FEED',
        titleEn: `Colostrum +${hours}h after ${label} calved`,
        titleNp: `${label} बियाएपछि +${hours} घण्टामा बिगौती`,
        dueAt: new Date(input.birthDate.getTime() + hours * 60 * 60 * 1000),
        priority: 'CRITICAL',
        sourceRefType: 'breedingRecord',
        sourceRefId: rec.id,
      });
    }
    for (const days of [7, 21]) {
      await ensureTask(this.prisma, {
        farmId: user.farmId,
        animalId: mother.id,
        type: 'POSTPARTUM_CHECK',
        titleEn: `Post-calving check ${label} +${days}d`,
        titleNp: `${label} बियाएपछि +${days} दिन जाँच`,
        dueAt: new Date(input.birthDate.getTime() + days * 24 * 60 * 60 * 1000),
        priority: 'HIGH',
        sourceRefType: 'breedingRecord',
        sourceRefId: rec.id,
      });
    }
    if (input.placentaExpelled === false) {
      await ensureTask(this.prisma, {
        farmId: user.farmId,
        animalId: mother.id,
        type: 'POSTPARTUM_CHECK',
        titleEn: `Retained placenta — ${label} needs a vet`,
        titleNp: `${label} को खेर नझरेको — भेटेरिनरी`,
        dueAt: new Date(input.birthDate.getTime() + 12 * 60 * 60 * 1000),
        priority: 'CRITICAL',
        sourceRefType: 'breedingRecord',
        sourceRefId: rec.id,
      });
    }
    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'breeding.calving',
      entityType: 'breedingRecord',
      entityId: rec.id,
      requestId,
    });
    return this.prisma.breedingRecord
      .findFirst({ where: { id: rec.id }, include: { mother: { select: { tag: true } } } })
      .then((r) => toDto(r!));
  }

  async pregnancyCheck(user: RequestUser, id: string, input: PregnancyCheck, requestId?: string) {
    const rec = await this.prisma.breedingRecord.findFirst({
      where: { id, farmId: user.farmId },
      include: { mother: true },
    });
    if (!rec?.mother) {
      throw new NotFoundException({ code: 'BREEDING_NOT_FOUND', message: 'Breeding record not found' });
    }
    const cfg = await this.speciesConfig.forSpecies(rec.mother.species as Species);
    const checkedAt = input.checkedAt ?? new Date();
    if (input.result === 'CONFIRMED') {
      let due = rec.dueDate;
      if (input.daysPregnant) {
        due = new Date(checkedAt.getTime() + (cfg.gestationDays - input.daysPregnant) * 24 * 60 * 60 * 1000);
      }
      await this.prisma.animal.update({
        where: { id: rec.motherId },
        data: { isPregnant: true, pregnancyConfirmedDate: checkedAt, expectedCalvingDate: due },
      });
      await this.prisma.breedingRecord.update({
        where: { id: rec.id },
        data: { pregnancyStatus: 'CONFIRMED', dueDate: due },
      });
      const label = rec.mother.herdNumber ?? rec.mother.tag;
      const dryOff = new Date(due);
      dryOff.setDate(dryOff.getDate() - cfg.dryOffDaysBeforeCalving);
      await ensureTask(this.prisma, {
        farmId: user.farmId,
        animalId: rec.motherId,
        type: 'DRY_OFF',
        titleEn: `Dry off ${label}`,
        titleNp: `${label} सुकाउने`,
        dueAt: dryOff,
        priority: 'HIGH',
        sourceRefType: 'breedingRecord',
        sourceRefId: rec.id,
      });
      for (const daysBefore of [7, 3, 1, 0]) {
        const watch = new Date(due);
        watch.setDate(watch.getDate() - daysBefore);
        await ensureTask(this.prisma, {
          farmId: user.farmId,
          animalId: rec.motherId,
          type: 'CALVING_WATCH',
          titleEn: daysBefore === 0 ? `${label} due to calve today` : `${label} calving in ${daysBefore}d`,
          titleNp: daysBefore === 0 ? `${label} आज बियाउने` : `${label} ${daysBefore} दिनमा बियाउने`,
          dueAt: watch,
          priority: 'CRITICAL',
          sourceRefType: 'breedingRecord',
          sourceRefId: rec.id,
        });
      }
    } else if (input.result === 'OPEN') {
      await this.prisma.animal.update({
        where: { id: rec.motherId },
        data: { isPregnant: false, expectedCalvingDate: null },
      });
      await this.prisma.breedingRecord.update({
        where: { id: rec.id },
        data: { pregnancyStatus: 'FAILED' },
      });
      await ensureTask(this.prisma, {
        farmId: user.farmId,
        animalId: rec.motherId,
        type: 'HEAT_WATCH',
        titleEn: `Heat watch after open PD — ${rec.mother.herdNumber ?? rec.mother.tag}`,
        titleNp: `खाली जाँचपछि रजस्वला हेर्ने`,
        dueAt: new Date(),
        priority: 'HIGH',
        sourceRefType: 'breedingRecord',
        sourceRefId: rec.id,
      });
    } else {
      await ensureTask(this.prisma, {
        farmId: user.farmId,
        animalId: rec.motherId,
        type: 'PREGNANCY_CHECK',
        titleEn: `Re-check pregnancy in 21 days`,
        titleNp: `२१ दिनमा फेरि गर्भ जाँच`,
        dueAt: new Date(checkedAt.getTime() + 21 * 24 * 60 * 60 * 1000),
        priority: 'HIGH',
        sourceRefType: 'breedingRecord',
        sourceRefId: rec.id,
      });
    }
    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'breeding.pd',
      entityType: 'breedingRecord',
      entityId: rec.id,
      metadata: { result: input.result },
      requestId,
    });
    const row = await this.prisma.breedingRecord.findFirst({
      where: { id: rec.id },
      include: { mother: { select: { tag: true } } },
    });
    return toDto(row!);
  }

  async recordColostrum(user: RequestUser, id: string, input: ColostrumInput, requestId?: string) {
    const rec = await this.prisma.breedingRecord.findFirst({
      where: { id, farmId: user.farmId },
    });
    if (!rec) {
      throw new NotFoundException({ code: 'BREEDING_NOT_FOUND', message: 'Breeding record not found' });
    }
    const within4h =
      rec.birthDate != null
        ? input.fedAt.getTime() - rec.birthDate.getTime() <= 4 * 60 * 60 * 1000
        : null;
    const row = await this.prisma.breedingRecord.update({
      where: { id: rec.id },
      data: {
        colostrumFed: true,
        colostrumWithin4h: within4h,
        colostrumLiters: input.liters,
      },
      include: { mother: { select: { tag: true } } },
    });
    if (rec.birthDate && input.fedAt.getTime() - rec.birthDate.getTime() > 6 * 60 * 60 * 1000 && rec.offspringAnimalId) {
      await ensureTask(this.prisma, {
        farmId: user.farmId,
        animalId: rec.offspringAnimalId,
        type: 'POSTPARTUM_CHECK',
        titleEn: 'Calf missed the colostrum window — daily check 21 days',
        titleNp: 'बाच्छोले बिगौती झ्याल छुटाएको — २१ दिन दैनिक जाँच',
        dueAt: new Date(),
        priority: 'CRITICAL',
        sourceRefType: 'breedingRecord',
        sourceRefId: rec.id,
      });
    }
    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'breeding.colostrum',
      entityType: 'breedingRecord',
      entityId: rec.id,
      requestId,
    });
    return toDto(row);
  }
}

function daysUntilReady(lactationStart: Date | null, waitingDays: number): number | null {
  if (!lactationStart) return null;
  const ready = new Date(lactationStart);
  ready.setDate(ready.getDate() + waitingDays);
  const left = Math.ceil((ready.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  return left > 0 ? left : null;
}

function daysRemaining(dueDate: Date, pregnancyStatus: string): number | null {
  if (pregnancyStatus === 'DELIVERED' || pregnancyStatus === 'FAILED') return null;
  return Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

type MotherHistory = {
  id: string;
  motherId: string;
  pregnancyStatus: string;
  matingDate: Date;
  birthDate: Date | null;
};

function toDto(r: BreedingWithMother, history: MotherHistory[] = []): BreedingRecordDto {
  const births = history
    .filter((h) => h.pregnancyStatus === 'DELIVERED' && h.birthDate)
    .sort((a, b) => (a.birthDate!.getTime() - b.birthDate!.getTime()));
  const failed = history.filter((h) => h.pregnancyStatus === 'FAILED').length;
  const lastBirthBeforeMating = births
    .filter((h) => h.birthDate! <= r.matingDate)
    .at(-1);
  const prevBirth = r.birthDate
    ? births.filter((h) => h.birthDate! < r.birthDate!).at(-1)
    : undefined;
  const daysOpen =
    r.pregnancyStatus === 'DELIVERED' || r.pregnancyStatus === 'FAILED'
      ? null
      : lastBirthBeforeMating?.birthDate
        ? Math.ceil(
            (r.matingDate.getTime() - lastBirthBeforeMating.birthDate.getTime()) /
              (1000 * 60 * 60 * 24),
          )
        : null;
  const calvingIntervalDays =
    r.birthDate && prevBirth?.birthDate
      ? Math.ceil(
          (r.birthDate.getTime() - prevBirth.birthDate.getTime()) /
            (1000 * 60 * 60 * 24),
        )
      : null;

  return {
    id: r.id,
    farmId: r.farmId,
    motherId: r.motherId,
    motherTag: r.mother?.tag ?? null,
    matingType: r.matingType,
    fatherTagOrAi: r.fatherTagOrAi,
    matingDate: r.matingDate.toISOString(),
    dueDate: r.dueDate.toISOString(),
    pregnancyStatus: r.pregnancyStatus,
    birthDate: r.birthDate?.toISOString() ?? null,
    offspringTag: r.offspringTag,
    offspringAnimalId: r.offspringAnimalId,
    calvingDifficulty: r.calvingDifficulty,
    colostrumFed: r.colostrumFed,
    colostrumWithin4h: r.colostrumWithin4h,
    colostrumLiters: r.colostrumLiters != null ? Number(r.colostrumLiters) : null,
    notes: r.notes,
    daysRemaining: daysRemaining(r.dueDate, r.pregnancyStatus),
    daysOpen,
    calvingIntervalDays,
    repeatBreeder: failed >= 3,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}
