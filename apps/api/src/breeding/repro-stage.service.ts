import { Injectable, Optional } from '@nestjs/common';
import type { Prisma, ReproStage as PrismaReproStage } from '@prisma/client';
import type { Species, SpeciesConfigDto } from '@farm/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { SpeciesConfigService } from '../species-config/species-config.service';
import { ReminderEngineService } from './reminder-engine.service';
import { REPRO_STAGES } from '@farm/contracts';
import {
  daysInMilk,
  daysToCalving,
  deriveStage,
  hoursBetween,
  monthsOfAge,
  wholeDays,
  type ReproStage,
  type ReproStageCfg,
  type ReproStageFacts,
} from './repro-stage';

const EXIT = ['SOLD', 'DEAD', 'CULLED'] as const;
const FAILED_RESULTS = ['FAILED', 'ABORTED'] as const;

type AnimalRow = {
  id: string;
  farmId: string;
  gender: 'MALE' | 'FEMALE';
  status: string;
  species: string;
  doNotBreed: boolean;
  isPregnant: boolean;
  expectedCalvingDate: Date | null;
  dateOfBirth: Date | null;
  lactationNumber: number;
  lactationStartDate: Date | null;
  herdNumber: string | null;
  tag: string;
  reproStage: PrismaReproStage;
  reproStageSince: Date | null;
};

@Injectable()
export class ReproStageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly species: SpeciesConfigService,
    @Optional() private readonly reminders?: ReminderEngineService,
  ) {}

  async recomputeAnimal(
    farmId: string,
    animalId: string,
    trigger: string,
    now = new Date(),
  ): Promise<ReproStage> {
    const animal = await this.prisma.animal.findFirst({
      where: { id: animalId, farmId, deletedAt: null },
    });
    if (!animal) return 'NOT_BREEDING';
    const cfg = await this.species.forSpecies(animal.species as Species);
    const facts = await this.factsFor(animal, now);
    return this.persist(animal, facts, toCfg(cfg), trigger, now);
  }

  async recomputeFarm(farmId: string, now = new Date(), trigger = 'NIGHTLY'): Promise<number> {
    const animals = await this.prisma.animal.findMany({
      where: { farmId, deletedAt: null },
    });
    if (animals.length === 0) return 0;
    const [enrollments, services, heats] = await Promise.all([
      this.prisma.syncEnrollment.findMany({
        where: { farmId, status: 'ACTIVE' },
        select: { animalId: true },
      }),
      this.prisma.breedingService.findMany({
        where: { farmId },
        select: { animalId: true, serviceDate: true, result: true },
        orderBy: { serviceDate: 'desc' },
      }),
      this.prisma.heatEvent.findMany({
        where: { farmId },
        select: { animalId: true, observedAt: true },
        orderBy: { observedAt: 'desc' },
      }),
    ]);
    const active = new Set(enrollments.map((row) => row.animalId));
    const servicesBy = groupBy(services, (row) => row.animalId);
    const heatsBy = groupBy(heats, (row) => row.animalId);
    let changed = 0;
    for (const animal of animals) {
      const cfg = await this.species.forSpecies(animal.species as Species);
      const facts = factsFromLists(
        animal,
        now,
        active.has(animal.id),
        servicesBy.get(animal.id) ?? [],
        heatsBy.get(animal.id) ?? [],
      );
      const next = await this.persist(animal, facts, toCfg(cfg), trigger, now);
      if (next !== animal.reproStage) changed += 1;
    }
    return changed;
  }

  async stageDurations(
    farmId: string,
    from?: Date,
    to?: Date,
    now = new Date(),
  ): Promise<{
    from: string | null;
    to: string | null;
    stages: Array<{
      stage: ReproStage;
      meanDays: number | null;
      sampleCount: number;
    }>;
    anestrusStuckBeyond60: number;
  }> {
    const enteredAt: Prisma.DateTimeFilter = {};
    if (from) enteredAt.gte = from;
    if (to) enteredAt.lte = to;
    const rows = await this.prisma.reproStageHistory.findMany({
      where: {
        farmId,
        daysInPrevious: { not: null },
        ...(from || to ? { enteredAt } : {}),
      },
      select: { fromStage: true, daysInPrevious: true },
    });
    const buckets = new Map<ReproStage, number[]>();
    for (const row of rows) {
      if (!row.fromStage || row.daysInPrevious == null) continue;
      const list = buckets.get(row.fromStage as ReproStage) ?? [];
      list.push(row.daysInPrevious);
      buckets.set(row.fromStage as ReproStage, list);
    }
    const stages = REPRO_STAGES.map((stage) => {
      const days = buckets.get(stage) ?? [];
      return {
        stage,
        meanDays: days.length ? days.reduce((a, b) => a + b, 0) / days.length : null,
        sampleCount: days.length,
      };
    });
    const anestrusStuckBeyond60 = await this.prisma.animal.count({
      where: {
        farmId,
        deletedAt: null,
        reproStage: 'ANESTRUS_SUSPECTED',
        reproStageSince: { lte: new Date(now.getTime() - 60 * DAY_MS) },
      },
    });
    return {
      from: from?.toISOString() ?? null,
      to: to?.toISOString() ?? null,
      stages,
      anestrusStuckBeyond60,
    };
  }

  private async factsFor(animal: AnimalRow, now: Date): Promise<ReproStageFacts> {
    const [enrollment, services, heats] = await Promise.all([
      this.prisma.syncEnrollment.findFirst({
        where: { farmId: animal.farmId, animalId: animal.id, status: 'ACTIVE' },
        select: { id: true },
      }),
      this.prisma.breedingService.findMany({
        where: { farmId: animal.farmId, animalId: animal.id },
        select: { serviceDate: true, result: true },
        orderBy: { serviceDate: 'desc' },
      }),
      this.prisma.heatEvent.findMany({
        where: { farmId: animal.farmId, animalId: animal.id },
        select: { observedAt: true },
        orderBy: { observedAt: 'desc' },
      }),
    ]);
    return factsFromLists(animal, now, Boolean(enrollment), services, heats);
  }

  private async persist(
    animal: AnimalRow,
    facts: ReproStageFacts,
    cfg: ReproStageCfg,
    trigger: string,
    now: Date,
  ): Promise<ReproStage> {
    const next = deriveStage(facts, cfg);
    if (next === animal.reproStage && animal.reproStageSince) {
      await this.prisma.animal.update({
        where: { id: animal.id },
        data: { reproStageComputedAt: now },
      });
      return next;
    }
    const daysInPrevious =
      animal.reproStageSince != null ? wholeDays(animal.reproStageSince, now) : null;
    await this.prisma.$transaction(async (tx) => {
      await tx.animal.update({
        where: { id: animal.id },
        data: {
          reproStage: next,
          reproStageSince: now,
          reproStageComputedAt: now,
        },
      });
      await tx.reproStageHistory.create({
        data: {
          farmId: animal.farmId,
          animalId: animal.id,
          fromStage: animal.reproStageSince ? animal.reproStage : null,
          toStage: next,
          enteredAt: now,
          daysInPrevious: animal.reproStageSince ? daysInPrevious : null,
          trigger,
        },
      });
      if (next === 'NOT_BREEDING' && EXIT.includes(animal.status as (typeof EXIT)[number])) {
        await tx.task.updateMany({
          where: {
            farmId: animal.farmId,
            animalId: animal.id,
            status: { in: ['PENDING', 'SNOOZED'] },
          },
          data: { status: 'SUPERSEDED' },
        });
      }
    });
    await this.reminders?.fireStageEntry(animal.farmId, animal, next, now);
    return next;
  }
}

function toCfg(cfg: SpeciesConfigDto): ReproStageCfg {
  return {
    ageFirstServiceMonths: cfg.ageFirstServiceMonths,
    voluntaryWaitingDays: cfg.voluntaryWaitingDays,
    pregnancyCheckEarliestDays: cfg.pregnancyCheckEarliestDays,
    serviceWindowEndHours: cfg.serviceWindowEndHours,
    dryOffDaysBeforeCalving: cfg.dryOffDaysBeforeCalving,
  };
}

function factsFromLists(
  animal: Pick<
    AnimalRow,
    | 'gender'
    | 'status'
    | 'doNotBreed'
    | 'isPregnant'
    | 'expectedCalvingDate'
    | 'dateOfBirth'
    | 'lactationNumber'
    | 'lactationStartDate'
  >,
  now: Date,
  hasActiveSyncEnrollment: boolean,
  services: Array<{ serviceDate: Date; result: string }>,
  heats: Array<{ observedAt: Date }>,
): ReproStageFacts {
  const sinceLactation = animal.lactationStartDate ?? new Date(0);
  const thisLactation = services.filter((row) => row.serviceDate >= sinceLactation);
  const pending = thisLactation.find((row) => row.result === 'PENDING');
  const lastHeat = heats[0];
  const lastHeatOrCalving = latestDate(lastHeat?.observedAt, animal.lactationStartDate);
  return {
    gender: animal.gender,
    status: animal.status,
    doNotBreed: animal.doNotBreed,
    hasActiveSyncEnrollment,
    isPregnant: animal.isPregnant,
    daysToCalving: daysToCalving(animal.expectedCalvingDate, now),
    ageMonths: monthsOfAge(animal.dateOfBirth, now),
    lactationNumber: animal.lactationNumber,
    neverServed: services.length === 0,
    daysInMilk: daysInMilk(animal.lactationStartDate, now),
    pendingServiceDaysAgo: pending ? wholeDays(pending.serviceDate, now) : null,
    hoursSinceHeat: lastHeat ? hoursBetween(lastHeat.observedAt, now) : null,
    failedServiceCount: thisLactation.filter((row) =>
      FAILED_RESULTS.includes(row.result as (typeof FAILED_RESULTS)[number]),
    ).length,
    daysSinceLastHeatOrCalving: lastHeatOrCalving ? wholeDays(lastHeatOrCalving, now) : null,
  };
}

function latestDate(a?: Date | null, b?: Date | null): Date | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return a > b ? a : b;
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = map.get(k);
    if (list) list.push(row);
    else map.set(k, [row]);
  }
  return map;
}

const DAY_MS = 24 * 60 * 60 * 1000;
