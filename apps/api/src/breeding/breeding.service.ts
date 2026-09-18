import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import type {
  BreedingCreate,
  BreedingListQuery,
  BreedingMetricsDto,
  BreedingUpdate,
  CalvingInput,
  ColostrumInput,
  PageResult,
  PedigreeNodeDto,
  PregnancyCheck,
  Species,
} from '@farm/contracts';
import { BREEDING_HERD_TARGETS } from '@farm/contracts';
import { HerdNumberService } from '../herd-number/herd-number.service';
import { ensureTask, completeOpenTasksOfType, supersedeOpenTasks } from '../jobs/task-writer';
import type { Animal, BreedingRecord, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { RequestUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { ProfitService } from '../profit/profit.service';
import { SpeciesConfigService } from '../species-config/species-config.service';
import { ReproStageService } from './repro-stage.service';
import { SYSTEM_REMINDER_RULES } from './reminder-catalog';
import { planReminders, type ReminderContext } from './reminder-engine';
import { ReminderEngineService } from './reminder-engine.service';
import { atNepalHour } from '../common/nepal-time';
import {
  addDays,
  addHours,
  buildPedigreeTree,
  colostrumTargetLitres,
  costOfOpenDaysNpr,
  daysBetween,
  derivedSlotId,
  expectedCalvingFromPd,
  expectedHeats,
  heatDetectionRatePct,
  hoursAfterBirth,
  inferCalvingOutcome,
  inbreedingSharedIds,
  isFreemartinSuspect,
  mapColostrumSource,
  mapPdResult,
  mean,
  mergeBreedComposition,
  monthsBetween,
  parseComplications,
  parseHeatSigns,
  ratePct,
  servicesPerConception,
  type ParentLink,
} from './breeding-rules';

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
  inbreedingWarning?: boolean;
  sharedAncestorIds?: string[];
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
    private readonly profit?: ProfitService,
    @Optional() private readonly reproStage?: ReproStageService,
    @Optional() private readonly reminders?: ReminderEngineService,
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
    const motherId = input.motherId ?? input.animalId;
    const mother = await this.prisma.animal.findFirst({
      where: { id: motherId, farmId: user.farmId, deletedAt: null },
    });
    if (!mother) {
      throw new NotFoundException({
        code: 'ANIMAL_NOT_FOUND',
        message: 'Mother animal not found',
      });
    }

    const cfg = await this.speciesConfig.forSpecies(mother.species as Species);
    const serviceDate = input.serviceDate ?? input.matingDate!;
    const method = (input.method ?? input.matingType ?? 'NATURAL') as 'NATURAL' | 'AI' | 'EMBRYO_TRANSFER';
    const dueDate = addDays(serviceDate, cfg.gestationDays);
    const since = mother.lactationStartDate ?? new Date(0);
    const prior = await this.prisma.breedingService.count({
      where: {
        farmId: user.farmId,
        animalId: mother.id,
        serviceDate: { gte: since },
        result: { not: 'PREGNANT' },
      },
    });
    const serviceNo = prior + 1;

    const service = await this.prisma.breedingService.create({
      data: {
        farmId: user.farmId,
        animalId: mother.id,
        serviceDate,
        heatEventId: input.heatEventId,
        method: method === 'EMBRYO_TRANSFER' ? 'EMBRYO_TRANSFER' : method === 'AI' ? 'AI' : 'NATURAL',
        sireId: input.sireId,
        strawId: input.strawId,
        technicianName: input.technicianName,
        technicianPhone: input.technicianPhone,
        costNpr: input.costNpr,
        serviceNo,
        result: 'PENDING',
        provisionalEdd: dueDate,
      },
    });

    const row = await this.prisma.breedingRecord.create({
      data: {
        farmId: user.farmId,
        motherId: mother.id,
        matingType: method === 'AI' ? 'AI' : 'NATURAL',
        fatherTagOrAi: input.fatherTagOrAi,
        matingDate: serviceDate,
        dueDate,
        pregnancyStatus: 'OPEN',
        notes: input.notes,
      },
      include: { mother: { select: { tag: true } } },
    });

    if (input.heatEventId) {
      await this.prisma.heatEvent.updateMany({
        where: { id: input.heatEventId, farmId: user.farmId },
        data: { wasBred: true },
      });
    } else {
      const latestHeat = await this.prisma.heatEvent.findFirst({
        where: { farmId: user.farmId, animalId: mother.id },
        orderBy: { observedAt: 'desc' },
      });
      if (latestHeat) {
        await this.prisma.heatEvent.update({
          where: { id: latestHeat.id },
          data: { wasBred: true },
        });
      }
    }
    if (input.strawId && method === 'AI') {
      await this.prisma.semenStraw.updateMany({
        where: { id: input.strawId, farmId: user.farmId, qtyRemaining: { gt: 0 } },
        data: { qtyRemaining: { decrement: 1 } },
      });
    }

    await supersedeOpenTasks(this.prisma, {
      farmId: user.farmId,
      animalId: mother.id,
      types: ['SERVICE_WINDOW', 'HEAT_WATCH', 'SILENT_HEAT_CHECK'],
    });
    await this.writeReminders(user.farmId, {
      event: 'SERVICE',
      species: mother.species as Species,
      shortNo: mother.herdNumber ?? mother.tag,
      now: serviceDate,
      anchorAt: serviceDate,
      anchorId: service.id,
      animalId: mother.id,
      serviceCount: serviceNo,
    });
    if (serviceNo >= 3) {
      const lactationServices = await this.prisma.breedingService.findMany({
        where: { farmId: user.farmId, animalId: mother.id, serviceDate: { gte: since } },
        select: { costNpr: true },
      });
      const aiCost = lactationServices.reduce((sum, row) => sum + Number(row.costNpr ?? 0), 0);
      await this.writeReminders(user.farmId, {
        event: 'SERVICE_3',
        species: mother.species as Species,
        shortNo: mother.herdNumber ?? mother.tag,
        now: serviceDate,
        anchorAt: serviceDate,
        anchorId: service.id,
        animalId: mother.id,
        serviceCount: serviceNo,
        aiCost,
      });
    }

    const activeEnrollment = await this.prisma.syncEnrollment.findFirst({
      where: { farmId: user.farmId, animalId: mother.id, status: 'ACTIVE' },
    });
    if (activeEnrollment) {
      await this.prisma.syncEnrollment.update({
        where: { id: activeEnrollment.id },
        data: { status: 'COMPLETED', aiDate: serviceDate, serviceId: service.id },
      });
      await supersedeOpenTasks(this.prisma, {
        farmId: user.farmId,
        animalId: mother.id,
        types: ['SYNC_AI', 'SYNC_INJECTION'],
      });
    }

    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'breeding.create',
      entityType: 'breedingRecord',
      entityId: row.id,
      metadata: { species: mother.species, dueDate: dueDate.toISOString(), serviceNo },
      requestId,
    });

    let inbreedingWarning = false;
    let sharedAncestorIds: string[] = [];
    if (input.sireId) {
      const links = await this.parentLinks(user.farmId);
      sharedAncestorIds = inbreedingSharedIds(mother.id, input.sireId, links);
      inbreedingWarning = sharedAncestorIds.length > 0;
    }

    await this.refreshStage(user.farmId, mother.id, 'SERVICE');
    return { ...toDto(row), inbreedingWarning, sharedAncestorIds };
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
        dueAt: addDays(new Date(), 1),
        priority: 'HIGH',
        sourceRefType: 'heatLog',
        sourceRefId: null,
      });
    }

    const row = await this.prisma.heatLog.create({
      data: {
        farmId: user.farmId,
        animalId: input.animalId,
        observedAt: input.observedAt,
        intensity: input.intensity === 'SILENT_SUSPECTED' ? 'WEAK' : input.intensity,
        observerName: input.observerName,
        signs: input.signs,
        notes: input.notes,
      },
      include: { animal: { select: { tag: true } } },
    });

    const signs = parseHeatSigns(input.signs, input.signList);
    const heatEvent = await this.prisma.heatEvent.create({
      data: {
        farmId: user.farmId,
        animalId: animal.id,
        observedAt: input.observedAt,
        intensity: input.intensity === 'SILENT_SUSPECTED' ? 'SILENT_SUSPECTED' : input.intensity,
        signs,
        observerId: user.id,
        notes: input.notes,
        deviceId: input.deviceId,
      },
    });
    await this.prisma.heatObservation.create({
      data: {
        farmId: user.farmId,
        animalId: animal.id,
        observedAt: input.observedAt,
        observed: true,
        heatEventId: heatEvent.id,
        observerId: user.id,
        taskId: input.taskId,
      },
    });
    if (input.taskId) {
      await this.prisma.task.updateMany({
        where: { id: input.taskId, farmId: user.farmId, status: { in: ['PENDING', 'SNOOZED'] } },
        data: { status: 'DONE', completedAt: input.observedAt, completedById: user.id },
      });
    }

    const serviceWindowStart = addHours(input.observedAt, cfg.serviceWindowStartHours);
    const serviceWindowEnd = addHours(input.observedAt, cfg.serviceWindowEndHours);
    const nextHeatAt = addDays(input.observedAt, cfg.estrusCycleDays);

    if (!animal.isPregnant) {
      await supersedeOpenTasks(this.prisma, {
        farmId: user.farmId,
        animalId: animal.id,
        types: ['HEAT_WATCH', 'SILENT_HEAT_CHECK', 'ANESTRUS_MINERAL', 'ANESTRUS_VET', 'ANESTRUS_DECISION'],
      });
      await this.writeReminders(user.farmId, {
        event: 'HEAT',
        species: animal.species as Species,
        shortNo: label,
        now: input.observedAt,
        anchorAt: input.observedAt,
        anchorId: heatEvent.id,
        animalId: animal.id,
        wasBred: false,
        inVoluntaryWait: Boolean(tooSoonDays),
      });
    }

    const since = animal.lactationStartDate ?? new Date(0);
    const heatCount = await this.prisma.heatEvent.count({
      where: { farmId: user.farmId, animalId: animal.id, observedAt: { gte: since } },
    });
    const serviceCount = await this.prisma.breedingService.count({
      where: { farmId: user.farmId, animalId: animal.id, serviceDate: { gte: since } },
    });
    if (heatCount >= 3 && serviceCount === 0) {
      await ensureTask(this.prisma, {
        farmId: user.farmId,
        animalId: animal.id,
        type: 'CYCLING_UNBRED',
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
    await this.refreshStage(user.farmId, animal.id, 'HEAT');
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
      heatEventId: heatEvent.id,
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
      include: { mother: { select: { tag: true, species: true } } },
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'BREEDING_NOT_FOUND',
        message: 'Breeding record not found',
      });
    }

    let dueDate = existing.dueDate;
    if (input.matingDate) {
      const cfg = await this.speciesConfig.forSpecies(existing.mother.species as Species);
      dueDate = addDays(input.matingDate, cfg.gestationDays);
    }

    const row = await this.prisma.breedingRecord.update({
      where: { id },
      data: {
        ...(input.pregnancyStatus !== undefined
          ? { pregnancyStatus: input.pregnancyStatus }
          : {}),
        ...(input.matingType !== undefined ? { matingType: input.matingType } : {}),
        ...(input.matingDate !== undefined ? { matingDate: input.matingDate, dueDate } : {}),
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

    if (input.pregnancyStatus !== undefined) {
      const pregnant =
        input.pregnancyStatus === 'PREGNANT' || input.pregnancyStatus === 'CONFIRMED';
      await this.prisma.animal.update({
        where: { id: existing.motherId },
        data: { isPregnant: pregnant },
      });
    }

    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'breeding.update',
      entityType: 'breedingRecord',
      entityId: row.id,
      requestId,
    });

    await this.refreshStage(user.farmId, existing.motherId, 'STATUS');
    return toDto(row);
  }

  async remove(user: RequestUser, id: string, requestId?: string): Promise<void> {
    const existing = await this.prisma.breedingRecord.findFirst({
      where: { id, farmId: user.farmId },
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'BREEDING_NOT_FOUND',
        message: 'Breeding record not found',
      });
    }

    await this.prisma.breedingRecord.delete({ where: { id } });

    const stillPregnant = await this.prisma.breedingRecord.findFirst({
      where: {
        farmId: user.farmId,
        motherId: existing.motherId,
        pregnancyStatus: { in: ['PREGNANT', 'CONFIRMED'] },
      },
    });
    if (!stillPregnant) {
      await this.prisma.animal.update({
        where: { id: existing.motherId },
        data: { isPregnant: false },
      });
    }

    await supersedeOpenTasks(this.prisma, {
      farmId: user.farmId,
      animalId: existing.motherId,
      types: [
        'PREGNANCY_CHECK',
        'DRY_OFF',
        'CALVING_WATCH',
        'COLOSTRUM_FEED',
        'POSTPARTUM_CHECK',
        'PD_STALLED',
      ],
    });

    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'breeding.delete',
      entityType: 'breedingRecord',
      entityId: id,
      requestId,
    });
    await this.refreshStage(user.farmId, existing.motherId, 'STATUS');
  }

  async updateHeat(
    user: RequestUser,
    id: string,
    input: import('@farm/contracts').HeatUpdate,
    requestId?: string,
  ) {
    const existing = await this.prisma.heatLog.findFirst({
      where: { id, farmId: user.farmId },
      include: { animal: { select: { tag: true } } },
    });
    if (!existing) {
      throw new NotFoundException({ code: 'HEAT_NOT_FOUND', message: 'Heat log not found' });
    }

    const intensity =
      input.intensity === undefined
        ? undefined
        : input.intensity === 'SILENT_SUSPECTED'
          ? 'WEAK'
          : input.intensity;
    const row = await this.prisma.heatLog.update({
      where: { id },
      data: {
        ...(input.observedAt !== undefined ? { observedAt: input.observedAt } : {}),
        ...(intensity !== undefined ? { intensity } : {}),
        ...(input.observerName !== undefined ? { observerName: input.observerName } : {}),
        ...(input.signs !== undefined ? { signs: input.signs } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
      include: { animal: { select: { tag: true } } },
    });

    const eventMatch = await this.prisma.heatEvent.findFirst({
      where: {
        farmId: user.farmId,
        animalId: existing.animalId,
        observedAt: existing.observedAt,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (eventMatch) {
      const signs =
        input.signs !== undefined || input.signList !== undefined
          ? parseHeatSigns(input.signs ?? existing.signs ?? undefined, input.signList)
          : undefined;
      await this.prisma.heatEvent.update({
        where: { id: eventMatch.id },
        data: {
          ...(input.observedAt !== undefined ? { observedAt: input.observedAt } : {}),
          ...(input.intensity !== undefined
            ? {
                intensity:
                  input.intensity === 'SILENT_SUSPECTED' ? 'SILENT_SUSPECTED' : input.intensity,
              }
            : {}),
          ...(signs !== undefined ? { signs } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
        },
      });
    }

    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'breeding.heat.update',
      entityType: 'heatLog',
      entityId: row.id,
      requestId,
    });
    await this.refreshStage(user.farmId, row.animalId, 'HEAT');
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
    };
  }

  async removeHeat(user: RequestUser, id: string, requestId?: string): Promise<void> {
    const existing = await this.prisma.heatLog.findFirst({
      where: { id, farmId: user.farmId },
    });
    if (!existing) {
      throw new NotFoundException({ code: 'HEAT_NOT_FOUND', message: 'Heat log not found' });
    }

    const eventMatch = await this.prisma.heatEvent.findFirst({
      where: {
        farmId: user.farmId,
        animalId: existing.animalId,
        observedAt: existing.observedAt,
      },
      orderBy: { createdAt: 'desc' },
    });

    await this.prisma.heatLog.delete({ where: { id } });
    if (eventMatch) {
      await this.prisma.heatObservation.deleteMany({
        where: { farmId: user.farmId, heatEventId: eventMatch.id },
      });
      // Services may still point at this heat — clear the link rather than cascade-delete them.
      await this.prisma.breedingService.updateMany({
        where: { farmId: user.farmId, heatEventId: eventMatch.id },
        data: { heatEventId: null },
      });
      await this.prisma.heatEvent.delete({ where: { id: eventMatch.id } });
    }

    await supersedeOpenTasks(this.prisma, {
      farmId: user.farmId,
      animalId: existing.animalId,
      types: ['HEAT_WATCH', 'SERVICE_WINDOW', 'SILENT_HEAT_CHECK'],
    });

    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'breeding.heat.delete',
      entityType: 'heatLog',
      entityId: id,
      requestId,
    });
    await this.refreshStage(user.farmId, existing.animalId, 'HEAT');
  }

  async recordCalving(user: RequestUser, id: string, input: CalvingInput, requestId?: string) {
    const rec = await this.prisma.breedingRecord.findFirst({
      where: { id, farmId: user.farmId },
    });
    if (!rec) {
      throw new NotFoundException({ code: 'BREEDING_NOT_FOUND', message: 'Breeding record not found' });
    }
    const service = await this.prisma.breedingService.findFirst({
      where: { farmId: user.farmId, animalId: rec.motherId },
      orderBy: { serviceDate: 'desc' },
    });
    const event = await this.recordFarmCalving(
      user,
      { ...input, damId: rec.motherId, serviceId: input.serviceId ?? service?.id },
      requestId,
      rec.id,
    );
    return event.breeding;
  }

  async recordFarmCalving(
    user: RequestUser,
    input: CalvingInput,
    requestId?: string,
    breedingRecordId?: string,
  ) {
    const damId = input.damId;
    if (!damId) {
      throw new BadRequestException({ code: 'DAM_REQUIRED', message: 'damId is required' });
    }
    const dam = await this.prisma.animal.findFirst({
      where: { id: damId, farmId: user.farmId, deletedAt: null },
    });
    if (!dam) {
      throw new NotFoundException({ code: 'ANIMAL_NOT_FOUND', message: 'Dam not found' });
    }

    const calvingAt = input.calvingAt ?? input.birthDate ?? new Date();
    const complications = parseComplications(input.complications);
    const placenta =
      input.placentaExpelledWithin12h ?? input.placentaExpelled ?? !complications.includes('RETAINED_PLACENTA');
    if (placenta === false && !complications.includes('RETAINED_PLACENTA')) {
      complications.push('RETAINED_PLACENTA');
    }
    const outcome = inferCalvingOutcome(input.outcome, input.calves.length);
    const cfg = await this.speciesConfig.forSpecies(dam.species as Species);
    const service = input.serviceId
      ? await this.prisma.breedingService.findFirst({
          where: { id: input.serviceId, farmId: user.farmId },
        })
      : null;
    const sire =
      service?.sireId
        ? await this.prisma.animal.findFirst({ where: { id: service.sireId, farmId: user.farmId } })
        : null;
    const priorCalving = await this.prisma.calvingEvent.findFirst({
      where: { farmId: user.farmId, damId: dam.id, outcome: { not: 'ABORTED' } },
      orderBy: { calvingAt: 'desc' },
    });
    const gestationDaysActual = service ? daysBetween(service.serviceDate, calvingAt) : null;
    const calvingIntervalDays = priorCalving
      ? daysBetween(priorCalving.calvingAt, calvingAt)
      : dam.lactationStartDate
        ? daysBetween(dam.lactationStartDate, calvingAt)
        : null;
    const daysOpenDays = service
      ? daysBetween(dam.lactationStartDate ?? service.serviceDate, service.serviceDate)
      : dam.lactationStartDate
        ? daysBetween(dam.lactationStartDate, calvingAt)
        : null;

    if (outcome === 'ABORTED') {
      return this.recordAbort(user, {
        dam,
        service,
        calvingAt,
        gestationDaysActual,
        complications,
        placenta,
        difficulty: input.difficulty ?? 'EASY',
        damConditionPost: input.damConditionPost ?? 'NORMAL',
        notes: input.notes,
        breedingRecordId,
        requestId,
      });
    }

    const expectedDryOff = addDays(calvingAt, cfg.lactationDays);
    const nextLactation = dam.lactationNumber + 1;
    const created = await this.prisma.$transaction(async (tx) => {
      const event = await tx.calvingEvent.create({
        data: {
          farmId: user.farmId,
          damId: dam.id,
          serviceId: service?.id,
          calvingAt,
          gestationDaysActual,
          difficulty: input.difficulty ?? 'EASY',
          complications,
          placentaExpelledWithin12h: placenta,
          outcome,
          damConditionPost: input.damConditionPost ?? 'NORMAL',
          assistedBy: input.assistedBy,
          calvingIntervalDays,
          daysOpenDays,
          notes: input.notes,
        },
      });

      const calves: Array<{ animalId: string; herdNumber: string; sex: string; freemartin: boolean }> = [];
      let firstCalfId: string | null = null;
      for (const [index, calf] of input.calves.entries()) {
        const weight = calf.birthWeightKg ?? calf.weightKg;
        const freemartin = isFreemartinSuspect(input.calves, index);
        const herdNumber = await this.herdNumbers.issue(tx, user.farmId, dam.species as Species);
        const createdCalf = await tx.animal.create({
          data: {
            farmId: user.farmId,
            tag: herdNumber,
            herdNumber,
            name: calf.name,
            species: dam.species,
            breed: dam.breed,
            dateOfBirth: calvingAt,
            dobIsEstimated: false,
            gender: calf.sex,
            source: 'BORN',
            status: 'GROWING',
            damId: dam.id,
            sireId: service?.sireId ?? null,
            motherTag: dam.tag,
            expectedLactationDays: cfg.lactationDays,
            birthWeightKg: weight,
            isFreemartinSuspect: freemartin,
            breedComposition: mergeBreedComposition(dam.breedComposition, sire?.breedComposition, dam.breed) as
              | Prisma.InputJsonValue
              | undefined,
          },
        });
        await tx.animalTag.create({
          data: {
            farmId: user.farmId,
            animalId: createdCalf.id,
            herdNumber,
            fullTag: herdNumber,
            reason: 'ISSUED',
          },
        });
        if (weight) {
          await tx.weightRecord.create({
            data: {
              farmId: user.farmId,
              animalId: createdCalf.id,
              weightKg: weight,
              recordedAt: calvingAt,
            },
          });
        }
        await tx.calfRecord.create({
          data: {
            calvingId: event.id,
            animalId: createdCalf.id,
            sex: calf.sex,
            birthWeightKg: weight,
            vigour: calf.vigour ?? 'NORMAL',
            isFreemartinSuspect: freemartin,
          },
        });
        if (!firstCalfId) firstCalfId = createdCalf.id;
        calves.push({ animalId: createdCalf.id, herdNumber, sex: calf.sex, freemartin });
      }

      await tx.animal.update({
        where: { id: dam.id },
        data: {
          status: 'LACTATING',
          isPregnant: false,
          lactationNumber: { increment: 1 },
          lactationStartDate: calvingAt,
          expectedCalvingDate: null,
          expectedDryOff,
        },
      });
      await tx.animalStatusHistory.create({
        data: {
          farmId: user.farmId,
          animalId: dam.id,
          fromStatus: dam.status,
          toStatus: 'LACTATING',
          reason: 'Calved',
          changedBy: user.id,
        },
      });
      await tx.animalMarker.updateMany({
        where: { farmId: user.farmId, animalId: dam.id, meaning: 'DRY', removedAt: null },
        data: { removedAt: calvingAt, removedById: user.id },
      });
      if (service) {
        await tx.breedingService.update({
          where: { id: service.id },
          data: { result: 'PREGNANT' },
        });
      }
      const rec = await this.touchBreedingRecord(tx, user.farmId, dam.id, breedingRecordId, {
        birthDate: calvingAt,
        pregnancyStatus: 'DELIVERED',
        calvingDifficulty: input.difficulty,
        offspringAnimalId: firstCalfId,
        notes: [input.notes, complications.join(', ')].filter(Boolean).join('; ') || undefined,
      });
      return { event, calves, breedingRecordId: rec?.id ?? breedingRecordId, firstCalfId };
    });

    const label = dam.herdNumber ?? dam.tag;
    await supersedeOpenTasks(this.prisma, {
      farmId: user.farmId,
      animalId: dam.id,
      types: ['CALVING_WATCH', 'DRY_OFF', 'FEED_TRANSITION'],
    });
    await this.prisma.animalMarker.updateMany({
      where: { farmId: user.farmId, animalId: dam.id, meaning: 'CALVING_SOON', removedAt: null },
      data: { removedAt: calvingAt, removedById: user.id },
    });
    for (const calf of created.calves) {
      if (!calf.animalId) continue;
      await this.writeReminders(
        user.farmId,
        {
          event: 'CALVING',
          species: dam.species as Species,
          shortNo: calf.herdNumber ?? label,
          now: calvingAt,
          anchorAt: calvingAt,
          anchorId: created.event.id,
          animalId: calf.animalId,
        },
        ['COLOSTRUM_1'],
      );
    }
    await this.writeReminders(
      user.farmId,
      {
        event: 'CALVING',
        species: dam.species as Species,
        shortNo: label,
        now: calvingAt,
        anchorAt: calvingAt,
        anchorId: created.event.id,
        animalId: dam.id,
        lactationStart: calvingAt,
      },
      ['RETAINED_PLACENTA', 'POSTPARTUM_1', 'POSTPARTUM_2'].filter(
        (code) => code !== 'RETAINED_PLACENTA' || !complications.includes('RETAINED_PLACENTA'),
      ),
    );
    const urgent = complications.includes('RETAINED_PLACENTA') || input.damConditionPost === 'CRITICAL';
    if (urgent) {
      await ensureTask(this.prisma, {
        farmId: user.farmId,
        animalId: dam.id,
        type: 'VET_URGENT',
        titleEn: complications.includes('RETAINED_PLACENTA')
          ? `Retained placenta — ${label} needs a vet now`
          : `${label} is critical after calving`,
        titleNp: complications.includes('RETAINED_PLACENTA')
          ? `${label} को खेर नझरेको — अहिले भेटेरिनरी`
          : `${label} बियाएपछि गम्भीर अवस्था`,
        dueAt: new Date(),
        priority: 'CRITICAL',
        sourceRefType: 'calvingEvent',
        sourceRefId: created.event.id,
      });
    }

    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'breeding.calving',
      entityType: 'calvingEvent',
      entityId: created.event.id,
      requestId,
    });

    await this.refreshStage(user.farmId, dam.id, 'CALVING');
    for (const calf of created.calves) {
      if (calf.animalId) await this.refreshStage(user.farmId, calf.animalId, 'CALVING');
    }

    const breeding = created.breedingRecordId
      ? await this.prisma.breedingRecord
          .findFirst({ where: { id: created.breedingRecordId }, include: { mother: { select: { tag: true } } } })
          .then((r) => (r ? toDto(r) : null))
      : null;

    return {
      id: created.event.id,
      damId: dam.id,
      serviceId: service?.id ?? null,
      sireId: service?.sireId ?? null,
      calvingAt: calvingAt.toISOString(),
      outcome,
      gestationDaysActual,
      calvingIntervalDays,
      daysOpenDays,
      calves: created.calves,
      dam: {
        lactationNumber: nextLactation,
        lactationStartDate: calvingAt.toISOString(),
        status: 'LACTATING',
        isPregnant: false,
        expectedDryOff: expectedDryOff.toISOString(),
      },
      breeding,
      brucellosisPrompt: false,
    };
  }

  private async recordAbort(
    user: RequestUser,
    args: {
      dam: Animal;
      service: { id: string } | null;
      calvingAt: Date;
      gestationDaysActual: number | null;
      complications: ReturnType<typeof parseComplications>;
      placenta: boolean | null;
      difficulty: 'EASY' | 'ASSISTED' | 'EMERGENCY' | 'STILLBIRTH';
      damConditionPost: 'NORMAL' | 'WEAK' | 'CRITICAL';
      notes?: string;
      breedingRecordId?: string;
      requestId?: string;
    },
  ) {
    const { dam } = args;
    const event = await this.prisma.calvingEvent.create({
      data: {
        farmId: user.farmId,
        damId: dam.id,
        serviceId: args.service?.id,
        calvingAt: args.calvingAt,
        gestationDaysActual: args.gestationDaysActual,
        difficulty: args.difficulty,
        complications: args.complications,
        placentaExpelledWithin12h: args.placenta,
        outcome: 'ABORTED',
        damConditionPost: args.damConditionPost,
        notes: args.notes,
      },
    });
    await this.prisma.animal.update({
      where: { id: dam.id },
      data: { isPregnant: false, expectedCalvingDate: null },
    });
    if (args.service) {
      await this.prisma.breedingService.update({
        where: { id: args.service.id },
        data: { result: 'ABORTED' },
      });
    }
    await this.touchBreedingRecord(this.prisma, user.farmId, dam.id, args.breedingRecordId, {
      pregnancyStatus: 'FAILED',
      notes: args.notes ?? 'ABORTED',
    });
    await supersedeOpenTasks(this.prisma, {
      farmId: user.farmId,
      animalId: dam.id,
      types: ['CALVING_WATCH', 'DRY_OFF', 'FEED_TRANSITION', 'PREGNANCY_CHECK', 'SERVICE_WINDOW'],
    });
    const abortLabel = dam.herdNumber ?? dam.tag;
    await ensureTask(this.prisma, {
      farmId: user.farmId,
      animalId: dam.id,
      type: 'HEAT_WATCH',
      titleEn: `Heat watch after abort — ${abortLabel}`,
      titleNp: `खेर गएपछि रजस्वला हेर्ने — ${abortLabel}`,
      dueAt: atNepalHour(addDays(args.calvingAt, 2), 5),
      priority: 'HIGH',
      sourceRefType: 'calvingEvent',
      sourceRefId: event.id,
    });
    const abortCount = await this.prisma.calvingEvent.count({
      where: { farmId: user.farmId, damId: dam.id, outcome: 'ABORTED' },
    });
    const brucellosisPrompt = abortCount >= 3;
    if (brucellosisPrompt) {
      await ensureTask(this.prisma, {
        farmId: user.farmId,
        animalId: dam.id,
        type: 'VET_URGENT',
        titleEn: `Brucellosis screening — ${dam.herdNumber ?? dam.tag} aborted three times`,
        titleNp: `ब्रुसेलोसिस जाँच — ${dam.herdNumber ?? dam.tag} तीन पटक खेर गएको`,
        dueAt: new Date(),
        priority: 'HIGH',
        sourceRefType: 'calvingEvent',
        sourceRefId: event.id,
      });
    }
    if (args.complications.includes('RETAINED_PLACENTA') || args.damConditionPost === 'CRITICAL') {
      await ensureTask(this.prisma, {
        farmId: user.farmId,
        animalId: dam.id,
        type: 'VET_URGENT',
        titleEn: `Urgent vet after abort — ${dam.herdNumber ?? dam.tag}`,
        titleNp: `खेर गएपछि भेटेरिनरी — ${dam.herdNumber ?? dam.tag}`,
        dueAt: new Date(),
        priority: 'CRITICAL',
        sourceRefType: 'calvingEvent',
        sourceRefId: derivedSlotId(event.id, 1),
      });
    }
    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'breeding.abort',
      entityType: 'calvingEvent',
      entityId: event.id,
      requestId: args.requestId,
    });
    return {
      id: event.id,
      damId: dam.id,
      serviceId: args.service?.id ?? null,
      sireId: null,
      calvingAt: args.calvingAt.toISOString(),
      outcome: 'ABORTED' as const,
      gestationDaysActual: args.gestationDaysActual,
      calves: [] as Array<{ animalId: string; herdNumber: string; sex: string; freemartin: boolean }>,
      dam: {
        lactationNumber: dam.lactationNumber,
        lactationStartDate: dam.lactationStartDate?.toISOString() ?? null,
        status: dam.status,
        isPregnant: false,
      },
      breeding: null,
      brucellosisPrompt,
    };
  }

  private async touchBreedingRecord(
    db: Prisma.TransactionClient | PrismaService,
    farmId: string,
    motherId: string,
    breedingRecordId: string | undefined,
    data: Prisma.BreedingRecordUncheckedUpdateInput,
  ) {
    const rec = breedingRecordId
      ? await db.breedingRecord.findFirst({ where: { id: breedingRecordId, farmId } })
      : await db.breedingRecord.findFirst({
          where: { farmId, motherId, pregnancyStatus: { in: ['PREGNANT', 'CONFIRMED', 'OPEN'] } },
          orderBy: { matingDate: 'desc' },
        });
    if (!rec) return null;
    return db.breedingRecord.update({ where: { id: rec.id }, data });
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
    const checkedAt = input.checkDate ?? input.checkedAt ?? new Date();
    const result = mapPdResult(input.result);
    const estimatedDays = input.estimatedDaysPregnant ?? input.daysPregnant;
    let service = await this.prisma.breedingService.findFirst({
      where: { farmId: user.farmId, animalId: rec.motherId },
      orderBy: { serviceDate: 'desc' },
    });
    if (!service) {
      service = await this.prisma.breedingService.create({
        data: {
          farmId: user.farmId,
          animalId: rec.motherId,
          serviceDate: rec.matingDate,
          method: rec.matingType === 'AI' ? 'AI' : 'NATURAL',
          result: 'PENDING',
          provisionalEdd: rec.dueDate,
        },
      });
    }
    await this.prisma.pregnancyCheck.create({
      data: {
        farmId: user.farmId,
        animalId: rec.motherId,
        serviceId: service.id,
        checkDate: checkedAt,
        method: input.method ?? 'OBSERVATION',
        result,
        estimatedDaysPregnant: estimatedDays,
        examinerName: input.examinerName ?? input.examiner,
        costNpr: input.costNpr ?? input.cost,
      },
    });

    await completeOpenTasksOfType(
      this.prisma,
      { farmId: user.farmId, animalId: rec.motherId, types: ['PREGNANCY_CHECK'] },
      user.id,
    );

    if (result === 'PREGNANT') {
      let due = rec.dueDate;
      if (estimatedDays) {
        due = expectedCalvingFromPd(checkedAt, cfg.gestationDays, estimatedDays);
      }
      await this.prisma.animal.update({
        where: { id: rec.motherId },
        data: { isPregnant: true, pregnancyConfirmedDate: checkedAt, expectedCalvingDate: due },
      });
      await this.prisma.breedingRecord.update({
        where: { id: rec.id },
        data: { pregnancyStatus: 'CONFIRMED', dueDate: due },
      });
      await this.prisma.breedingService.update({
        where: { id: service.id },
        data: { result: 'PREGNANT', provisionalEdd: due },
      });
      await this.prisma.task.updateMany({
        where: {
          farmId: user.farmId,
          animalId: rec.motherId,
          type: {
            in: [
              'HEAT_WATCH',
              'SERVICE_WINDOW',
              'SILENT_HEAT_CHECK',
              'ANESTRUS_MINERAL',
              'ANESTRUS_VET',
              'ANESTRUS_DECISION',
            ],
          },
          status: { in: ['PENDING', 'SNOOZED'] },
        },
        data: { status: 'SUPERSEDED' },
      });
      const label = rec.mother.herdNumber ?? rec.mother.tag;
      await this.writeReminders(user.farmId, {
        event: 'PREG_CONFIRMED',
        species: rec.mother.species as Species,
        shortNo: label,
        now: checkedAt,
        anchorAt: checkedAt,
        anchorId: rec.id,
        animalId: rec.motherId,
        status: rec.mother.status,
        expectedCalvingDate: due,
      });
      await ensureTask(this.prisma, {
        farmId: user.farmId,
        animalId: rec.motherId,
        type: 'APPLY_MARKER',
        titleEn: `Calving-soon band on ${label}`,
        titleNp: `${label} मा बियाइ-नजिक ब्यान्ड`,
        dueAt: addDays(due, -30),
        priority: 'NORMAL',
        sourceRefType: 'breedingRecord',
        sourceRefId: derivedSlotId(rec.id, 81),
      });
    } else if (result === 'NOT_PREGNANT') {
      await this.prisma.animal.update({
        where: { id: rec.motherId },
        data: { isPregnant: false, expectedCalvingDate: null, pregnancyConfirmedDate: null },
      });
      // Work scheduled off an expected calving date is now meaningless.
      await supersedeOpenTasks(this.prisma, {
        farmId: user.farmId,
        animalId: rec.motherId,
        types: ['CALVING_WATCH', 'DRY_OFF', 'FEED_TRANSITION'],
      });
      await this.prisma.breedingRecord.update({
        where: { id: rec.id },
        data: { pregnancyStatus: 'FAILED' },
      });
      await this.prisma.breedingService.update({
        where: { id: service.id },
        data: { result: 'FAILED' },
      });
      const failedCount = await this.prisma.breedingService.count({
        where: { farmId: user.farmId, animalId: rec.motherId, result: 'FAILED' },
      });
      const heatWatchAt = atNepalHour(addDays(checkedAt, 2), 5);
      await ensureTask(this.prisma, {
        farmId: user.farmId,
        animalId: rec.motherId,
        type: 'HEAT_WATCH',
        titleEn: `Heat watch after open PD — ${rec.mother.herdNumber ?? rec.mother.tag}`,
        titleNp: `खाली जाँचपछि रजस्वला हेर्ने`,
        dueAt: heatWatchAt,
        priority: 'HIGH',
        sourceRefType: 'breedingRecord',
        sourceRefId: rec.id,
      });
      if (failedCount >= 3) {
        await ensureTask(this.prisma, {
          farmId: user.farmId,
          animalId: rec.motherId,
          type: 'REPEAT_BREEDER',
          titleEn: `Repeat breeder ${rec.mother.herdNumber ?? rec.mother.tag} — ${failedCount} failed services`,
          titleNp: `दोहोरिने प्रजनन ${rec.mother.herdNumber ?? rec.mother.tag}`,
          dueAt: new Date(),
          priority: 'HIGH',
          sourceRefType: 'breedingService',
          sourceRefId: service.id,
        });
      }
    } else {
      await ensureTask(this.prisma, {
        farmId: user.farmId,
        animalId: rec.motherId,
        type: 'PREGNANCY_CHECK',
        titleEn: `Re-check pregnancy in 21 days`,
        titleNp: `२१ दिनमा फेरि गर्भ जाँच`,
        dueAt: addDays(checkedAt, 21),
        priority: 'NORMAL',
        sourceRefType: 'breedingRecord',
        sourceRefId: derivedSlotId(rec.id, 21),
      });
      const inconclusive = await this.prisma.pregnancyCheck.count({
        where: { farmId: user.farmId, serviceId: service.id, result: 'INCONCLUSIVE' },
      });
      if (inconclusive >= 2) {
        await ensureTask(this.prisma, {
          farmId: user.farmId,
          animalId: rec.motherId,
          type: 'PD_STALLED',
          titleEn: `Pregnancy check inconclusive twice — ${rec.mother.herdNumber ?? rec.mother.tag}`,
          titleNp: `${rec.mother.herdNumber ?? rec.mother.tag} को गर्भ जाँच दुई पटक अनिर्णित`,
          dueAt: new Date(),
          priority: 'HIGH',
          sourceRefType: 'breedingService',
          sourceRefId: service.id,
        });
      }
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
    await this.refreshStage(
      user.farmId,
      rec.motherId,
      result === 'PREGNANT' ? 'PREG_CONFIRMED' : 'SERVICE',
    );
    return toDto(row!);
  }

  async recordColostrum(user: RequestUser, id: string, input: ColostrumInput, requestId?: string) {
    const rec = await this.prisma.breedingRecord.findFirst({
      where: { id, farmId: user.farmId },
    });
    if (!rec) {
      throw new NotFoundException({ code: 'BREEDING_NOT_FOUND', message: 'Breeding record not found' });
    }
    const feeding = await this.recordFarmColostrum(
      user,
      { ...input, calfId: input.calfId ?? rec.offspringAnimalId ?? undefined },
      requestId,
      rec.id,
    );
    return feeding.breeding ?? feeding;
  }

  async recordFarmColostrum(
    user: RequestUser,
    input: ColostrumInput,
    requestId?: string,
    breedingRecordId?: string,
  ) {
    const volume = input.volumeLitres ?? input.liters;
    if (volume == null) {
      throw new BadRequestException({ code: 'VOLUME_REQUIRED', message: 'volumeLitres is required' });
    }
    const calf = input.calfId
      ? await this.prisma.animal.findFirst({ where: { id: input.calfId, farmId: user.farmId, deletedAt: null } })
      : null;
    let calfRecord = input.calfRecordId
      ? await this.prisma.calfRecord.findFirst({
          where: { id: input.calfRecordId },
          include: { calving: true, animal: true },
        })
      : calf
        ? await this.prisma.calfRecord.findFirst({
            where: { animalId: calf.id },
            include: { calving: true, animal: true },
          })
        : null;
    if (!calfRecord && calf) {
      const calving = await this.prisma.calvingEvent.findFirst({
        where: { farmId: user.farmId, damId: calf.damId ?? undefined },
        orderBy: { calvingAt: 'desc' },
      });
      if (calving) {
        calfRecord = await this.prisma.calfRecord.create({
          data: {
            calvingId: calving.id,
            animalId: calf.id,
            sex: calf.gender,
            birthWeightKg: calf.birthWeightKg,
          },
          include: { calving: true, animal: true },
        });
      }
    }
    if (!calfRecord) {
      throw new NotFoundException({ code: 'CALF_NOT_FOUND', message: 'Calf record not found' });
    }
    const animal = calfRecord.animal ?? calf;
    const dob = animal?.dateOfBirth ?? calfRecord.calving.calvingAt;
    const hours = hoursAfterBirth(input.fedAt, dob);
    const birthWeight = Number(animal?.birthWeightKg ?? calfRecord.birthWeightKg ?? 0) || null;
    const target = colostrumTargetLitres(birthWeight);
    const belowTarget = target != null && volume < target;
    const late = hours > 6;

    const feeding = await this.prisma.colostrumFeeding.create({
      data: {
        farmId: user.farmId,
        calfRecordId: calfRecord.id,
        animalId: animal?.id,
        taskId: input.taskId,
        fedAt: input.fedAt,
        hoursAfterBirth: hours,
        volumeLitres: volume,
        source: mapColostrumSource(input.source),
        method: input.method ?? 'BOTTLE',
        quality: input.quality === 'NOT_ASSESSED' || !input.quality ? 'NOT_ASSESSED' : input.quality,
        heatTreated: input.heatTreated ?? false,
        fedById: user.id,
      },
    });

    if (late && animal && !animal.highRiskFPT) {
      await this.prisma.animal.update({
        where: { id: animal.id },
        data: { highRiskFPT: true },
      });
      await this.writeReminders(user.farmId, {
        event: 'COLOSTRUM_LATE',
        species: animal.species as Species,
        shortNo: animal.herdNumber ?? animal.tag,
        now: input.fedAt,
        anchorAt: dob,
        anchorId: feeding.id,
        animalId: animal.id,
        colostrumHours: hours,
      });
    }

    if (input.taskId) {
      await this.prisma.task.updateMany({
        where: { id: input.taskId, farmId: user.farmId, status: { in: ['PENDING', 'SNOOZED'] } },
        data: { status: 'DONE', completedAt: input.fedAt, completedById: user.id },
      });
    }
    const feedCount = await this.prisma.colostrumFeeding.count({
      where: { calfRecordId: calfRecord.id },
    });
    const nextEvent = feedCount === 1 ? 'COLOSTRUM_1_DONE' : feedCount === 2 ? 'COLOSTRUM_2_DONE' : null;
    const nextHours = feedCount === 1 ? 6 : feedCount === 2 ? 8 : null;
    if (nextEvent && animal) {
      await this.writeReminders(user.farmId, {
        event: nextEvent,
        species: animal.species as Species,
        shortNo: animal.herdNumber ?? animal.tag,
        now: input.fedAt,
        anchorAt: input.fedAt,
        anchorId: feeding.id,
        animalId: animal.id,
      });
    }

    if (breedingRecordId) {
      const rec = await this.prisma.breedingRecord.findFirst({ where: { id: breedingRecordId, farmId: user.farmId } });
      if (rec) {
        await this.prisma.breedingRecord.update({
          where: { id: rec.id },
          data: {
            colostrumFed: true,
            colostrumWithin4h: hours <= 4,
            colostrumLiters: volume,
          },
        });
      }
    }

    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'breeding.colostrum',
      entityType: 'colostrumFeeding',
      entityId: feeding.id,
      requestId,
    });

    if (animal?.id) await this.refreshStage(user.farmId, animal.id, 'COLOSTRUM');
    if (calfRecord.calving.damId) await this.refreshStage(user.farmId, calfRecord.calving.damId, 'COLOSTRUM');

    const breeding = breedingRecordId
      ? await this.prisma.breedingRecord
          .findFirst({ where: { id: breedingRecordId }, include: { mother: { select: { tag: true } } } })
          .then((r) => (r ? toDto(r) : null))
      : null;

    return {
      id: feeding.id,
      calfId: animal?.id ?? null,
      hoursAfterBirth: hours,
      volumeLitres: volume,
      belowTarget,
      targetLitres: target,
      highRiskFPT: late,
      nextTaskHours: nextHours,
      breeding,
    };
  }

  async herdMetrics(user: RequestUser): Promise<BreedingMetricsDto> {
    const EXIT = ['SOLD', 'DEAD', 'CULLED'];
    const now = new Date();
    const windowStart = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    const animals = await this.prisma.animal.findMany({
      where: { farmId: user.farmId, deletedAt: null, gender: 'FEMALE' },
    });
    const [calvings, services, heats, metrics, configs] = await Promise.all([
      this.prisma.calvingEvent.findMany({
        where: { farmId: user.farmId, outcome: { not: 'ABORTED' } },
        orderBy: { calvingAt: 'asc' },
      }),
      this.prisma.breedingService.findMany({ where: { farmId: user.farmId } }),
      this.prisma.heatEvent.findMany({
        where: { farmId: user.farmId, observedAt: { gte: windowStart } },
      }),
      this.prisma.dailyMetric.findMany({
        where: { farmId: user.farmId },
        orderBy: { date: 'desc' },
        take: 500,
      }),
      this.speciesConfig.all(),
    ]);
    const cfgBySpecies = new Map(configs.map((c) => [c.species, c]));
    const yieldByAnimal = new Map<string, number>();
    for (const row of metrics) {
      if (row.animalId && row.rolling7Mean != null && !yieldByAnimal.has(row.animalId)) {
        yieldByAnimal.set(row.animalId, Number(row.rolling7Mean));
      }
    }
    const herdYield = mean([...yieldByAnimal.values()]);
    const price = this.profit ? (await this.profit.effectivePrice(user.farmId)).effectivePrice : 0;

    const daysOpenVals: number[] = [];
    for (const ev of calvings) {
      if (ev.daysOpenDays != null) daysOpenVals.push(ev.daysOpenDays);
    }
    for (const animal of animals) {
      if (EXIT.includes(animal.status) || animal.isPregnant) continue;
      const lastCalving = [...calvings].reverse().find((c) => c.damId === animal.id);
      const start = lastCalving?.calvingAt ?? animal.lactationStartDate;
      if (!start) continue;
      daysOpenVals.push(daysBetween(start, now));
    }

    const intervalVals: number[] = [];
    let costTotal = 0;
    for (const ev of calvings) {
      if (ev.calvingIntervalDays == null) continue;
      intervalVals.push(ev.calvingIntervalDays);
      const dam = animals.find((a) => a.id === ev.damId);
      const target =
        (dam ? cfgBySpecies.get(dam.species as Species) : undefined)?.targetCalvingIntervalDays ??
        cfgBySpecies.get('BUFFALO')?.targetCalvingIntervalDays ??
        0;
      const yld = (dam ? yieldByAnimal.get(dam.id) : undefined) ?? herdYield ?? 0;
      costTotal += costOfOpenDaysNpr(ev.calvingIntervalDays, target, yld, price);
    }

    const decided = services.filter((s) => s.result === 'PREGNANT' || s.result === 'FAILED');
    const conceptions = decided.filter((s) => s.result === 'PREGNANT').length;
    const first = decided.filter((s) => s.serviceNo === 1);
    const firstOk = first.filter((s) => s.result === 'PREGNANT').length;

    const standing = (signs: string[]) => signs.includes('STANDING_HEAT');
    const observerIds = [...new Set(heats.map((h) => h.observerId).filter((id): id is string => Boolean(id)))];
    const users = observerIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: observerIds } }, select: { id: true, name: true } })
      : [];
    const nameById = new Map(users.map((u) => [u.id, u.name]));

    let expectedTotal = 0;
    for (const animal of animals) {
      if (EXIT.includes(animal.status)) continue;
      const cfg = cfgBySpecies.get(animal.species as Species);
      const cycle = cfg?.estrusCycleDays ?? 21;
      const lastCalving = [...calvings].reverse().find((c) => c.damId === animal.id);
      const pregnantService = [...services]
        .filter((s) => s.animalId === animal.id && s.result === 'PREGNANT')
        .sort((a, b) => b.serviceDate.getTime() - a.serviceDate.getTime())[0];
      const openStart = lastCalving?.calvingAt ?? animal.lactationStartDate ?? windowStart;
      const openEnd = animal.isPregnant && pregnantService ? pregnantService.serviceDate : now;
      const from = openStart > windowStart ? openStart : windowStart;
      const to = openEnd < now ? openEnd : now;
      if (to > from) expectedTotal += expectedHeats(daysBetween(from, to), cycle);
    }

    const firstCalves = new Map<string, Date>();
    for (const ev of calvings) {
      const prev = firstCalves.get(ev.damId);
      if (!prev || ev.calvingAt < prev) firstCalves.set(ev.damId, ev.calvingAt);
    }
    const firstAges: number[] = [];
    for (const animal of animals) {
      const firstAt = firstCalves.get(animal.id);
      if (firstAt && animal.dateOfBirth) firstAges.push(monthsBetween(animal.dateOfBirth, firstAt));
    }

    const buffaloTarget = cfgBySpecies.get('BUFFALO')?.targetCalvingIntervalDays ?? null;

    return {
      daysOpen: mean(daysOpenVals) != null ? Math.round(mean(daysOpenVals)!) : null,
      calvingIntervalDays: mean(intervalVals) != null ? Math.round(mean(intervalVals)!) : null,
      servicesPerConception: servicesPerConception(decided.length, conceptions),
      conceptionRatePct: ratePct(conceptions, decided.length),
      firstServiceRatePct: ratePct(firstOk, first.length),
      heatDetectionRatePct: heatDetectionRatePct(heats.length, expectedTotal),
      ageAtFirstCalvingMonths: mean(firstAges) != null ? Math.round(mean(firstAges)!) : null,
      costOfOpenDaysNpr: intervalVals.length ? costTotal : null,
      avgDailyYield: herdYield,
      effectivePriceNpr: price,
      targets: {
        conceptionRateMinPct: BREEDING_HERD_TARGETS.conceptionRateMinPct,
        daysOpenMax: BREEDING_HERD_TARGETS.daysOpenMax,
        calvingIntervalMaxDays: buffaloTarget,
      },
      observers: observerIds.map((id) => {
        const theirs = heats.filter((h) => h.observerId === id);
        return {
          observerId: id,
          observerName: nameById.get(id) ?? null,
          heatsObserved: theirs.length,
          standingHeatCount: theirs.filter((h) => standing(h.signs ?? [])).length,
          heatDetectionRatePct: heatDetectionRatePct(theirs.length, expectedTotal),
        };
      }),
    };
  }

  async pedigree(user: RequestUser, animalId: string): Promise<PedigreeNodeDto> {
    const animal = await this.prisma.animal.findFirst({
      where: { id: animalId, farmId: user.farmId, deletedAt: null },
    });
    if (!animal) {
      throw new NotFoundException({ code: 'ANIMAL_NOT_FOUND', message: 'Animal not found' });
    }
    const herd = await this.prisma.animal.findMany({
      where: { farmId: user.farmId },
      select: { id: true, tag: true, herdNumber: true, name: true, damId: true, sireId: true },
    });
    const byId = new Map(herd.map((a) => [a.id, a]));
    const tree = buildPedigreeTree(animal.id, byId, 3);
    if (!tree) {
      throw new NotFoundException({ code: 'ANIMAL_NOT_FOUND', message: 'Animal not found' });
    }
    return tree;
  }

  private async parentLinks(farmId: string): Promise<Record<string, ParentLink>> {
    const herd = await this.prisma.animal.findMany({
      where: { farmId },
      select: { id: true, damId: true, sireId: true },
    });
    const links: Record<string, ParentLink> = {};
    for (const a of herd) links[a.id] = { damId: a.damId, sireId: a.sireId };
    return links;
  }

  private async refreshStage(farmId: string, animalId: string, trigger: string): Promise<void> {
    await this.reproStage?.recomputeAnimal(farmId, animalId, trigger);
  }

  private async writeReminders(
    farmId: string,
    ctx: ReminderContext,
    onlyCodes?: string[],
  ): Promise<void> {
    if (this.reminders) {
      await this.reminders.fireFiltered(farmId, ctx, onlyCodes);
      return;
    }
    const cfg = await this.speciesConfig.forSpecies(ctx.species);
    let planned = planReminders(SYSTEM_REMINDER_RULES, ctx, cfg);
    if (onlyCodes) planned = planned.filter((row) => onlyCodes.includes(row.code));
    for (const task of planned) {
      await ensureTask(this.prisma, {
        farmId,
        animalId: ctx.animalId,
        type: task.taskType,
        titleEn: task.titleEn,
        titleNp: task.titleNp,
        dueAt: task.dueAt,
        priority: task.priority,
        sourceRefType: task.sourceRefType,
        sourceRefId: task.sourceRefId,
      });
    }
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
