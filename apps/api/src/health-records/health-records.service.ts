import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  HEALTH_DEFAULT_INTERVAL_DAYS,
  NEPAL_VACCINE_PROTOCOLS,
  type GroupVaccinate,
  type HealthCreate,
  type HealthListQuery,
  type MortalityRecordCreate,
  type MortalityRecordDto,
  type PageResult,
  type UdderCheckCreate,
  type UdderCheckDto,
} from '@farm/contracts';
import { completeOpenTask, ensureTask } from '../jobs/task-writer';
import type { HealthRecord, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { RequestUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { ProfitService } from '../profit/profit.service';
import { daysInMilk } from '../profit/profit-rules';
import { SpeciesConfigService } from '../species-config/species-config.service';
import { WithholdsService } from '../withholds/withholds.service';
import { ReproStageService } from '../breeding/repro-stage.service';
import {
  affectedQuarters,
  classifyMastitis,
  estimatedMortalityLoss,
  hoursBetweenDoses,
  remainingDoseCount,
  remainingLactationValue,
  temperatureOutOfRange,
  type QuarterScores,
} from './health-rules';

export interface HealthRecordDto {
  id: string;
  farmId: string;
  type: string;
  title: string;
  animalId: string | null;
  groupId: string | null;
  herdBatchId: string | null;
  animalTag: string | null;
  animalName: string | null;
  herdBatchName: string | null;
  cost: number | null;
  medicine: string | null;
  dosage: string | null;
  method: string | null;
  vetName: string | null;
  outcome: string | null;
  followUpAt: string | null;
  cmtResult: string | null;
  milkWithholdUntil: string | null;
  meatWithholdUntil: string | null;
  batchNumber: string | null;
  performedAt: string;
  nextDueAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  symptoms?: string[];
  temperatureC?: number | null;
  temperatureOutOfRange?: boolean;
  severity?: string | null;
  provisionalDiagnosis?: string | null;
}

type HealthWithRelations = HealthRecord & {
  animal?: { tag: string; name: string | null } | null;
  herdBatch?: { name: string } | null;
};

@Injectable()
export class HealthRecordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly withholds: WithholdsService,
    private readonly speciesConfig?: SpeciesConfigService,
    private readonly profit?: ProfitService,
    @Optional() private readonly reproStage?: ReproStageService,
  ) {}

  async list(
    user: RequestUser,
    query: HealthListQuery,
  ): Promise<PageResult<HealthRecordDto>> {
    const now = new Date();
    const soon = new Date(now);
    soon.setDate(soon.getDate() + 7);

    const dueFilter: Prisma.HealthRecordWhereInput =
      query.due === 'overdue'
        ? { nextDueAt: { lt: now } }
        : query.due === 'due_soon'
          ? { nextDueAt: { gte: now, lte: soon } }
          : {};

    const where: Prisma.HealthRecordWhereInput = {
      farmId: user.farmId,
      ...(query.type ? { type: query.type } : {}),
      ...(query.animalId ? { animalId: query.animalId } : {}),
      ...dueFilter,
    };

    const [rows, total] = await Promise.all([
      this.prisma.healthRecord.findMany({
        where,
        include: {
          animal: { select: { tag: true, name: true } },
          herdBatch: { select: { name: true } },
        },
        orderBy: { performedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.healthRecord.count({ where }),
    ]);

    return {
      items: rows.map(toDto),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async calendar(
    user: RequestUser,
    query: import('@farm/contracts').HealthCalendarQuery,
  ): Promise<HealthRecordDto[]> {
    const now = new Date();
    const from = query.from ?? now;
    const to = query.to ?? new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.healthRecord.findMany({
      where: {
        farmId: user.farmId,
        nextDueAt: { gte: from, lte: to },
      },
      include: {
        animal: { select: { tag: true, name: true } },
        herdBatch: { select: { name: true } },
      },
      orderBy: { nextDueAt: 'asc' },
      take: 200,
    });
    return rows.map(toDto);
  }

  async get(user: RequestUser, id: string): Promise<HealthRecordDto> {
    const row = await this.prisma.healthRecord.findFirst({
      where: { id, farmId: user.farmId },
      include: {
        animal: { select: { tag: true, name: true } },
        herdBatch: { select: { name: true } },
      },
    });
    if (!row) {
      throw new NotFoundException({
        code: 'HEALTH_RECORD_NOT_FOUND',
        message: 'Health record not found',
      });
    }
    return toDto(row);
  }

  async create(
    user: RequestUser,
    input: HealthCreate,
    requestId?: string,
  ): Promise<HealthRecordDto> {
    let nextDueAt = input.nextDueAt;
    if (!nextDueAt) {
      const days = HEALTH_DEFAULT_INTERVAL_DAYS[input.type];
      if (days) {
        nextDueAt = new Date(input.performedAt);
        nextDueAt.setDate(nextDueAt.getDate() + days);
      }
    }

    const row = await this.prisma.healthRecord.create({
      data: {
        farmId: user.farmId,
        type: input.type,
        title: input.title,
        animalId: input.animalId,
        groupId: input.groupId,
        herdBatchId: input.herdBatchId,
        cost: input.cost,
        medicine: input.medicine,
        dosage: input.dosage,
        method: input.method,
        vetName: input.vetName,
        outcome: input.outcome,
        followUpAt: input.followUpAt,
        cmtResult: input.cmtResult,
        milkWithholdUntil: input.milkWithholdUntil,
        meatWithholdUntil: input.meatWithholdUntil,
        batchNumber: input.batchNumber,
        inventoryItemId: input.inventoryItemId,
        durationDays: input.durationDays,
        performedAt: input.performedAt,
        nextDueAt,
        notes: input.notes,
      },
      include: {
        animal: { select: { tag: true, name: true } },
        herdBatch: { select: { name: true } },
      },
    });

    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'health.create',
      entityType: 'healthRecord',
      entityId: row.id,
      requestId,
    });

    if (input.animalId) {
      await this.withholds.applyFromTreatment(user, {
        animalId: input.animalId,
        healthEventId: row.id,
        inventoryItemId: input.inventoryItemId,
        medicine: input.medicine ?? input.title,
        firstDoseAt: input.performedAt,
        durationDays: input.durationDays ?? 0,
        explicitMilkUntil: input.milkWithholdUntil,
        explicitMeatUntil: input.meatWithholdUntil,
      });
      if (input.type === 'CHECKUP') {
        await completeOpenTask(
          this.prisma,
          { farmId: user.farmId, type: 'POSTPARTUM_CHECK', animalId: input.animalId },
          user.id,
        );
        const abnormal = (input.outcome ?? '').length > 0 && !/^(normal|healthy|ok|none)$/i.test(input.outcome ?? '');
        if (abnormal) {
          const watch = await this.prisma.task.findFirst({
            where: {
              farmId: user.farmId,
              animalId: input.animalId,
              type: 'HEAT_WATCH',
              status: { in: ['PENDING', 'SNOOZED'] },
            },
          });
          if (watch) {
            await this.prisma.task.update({
              where: { id: watch.id },
              data: { dueAt: new Date(watch.dueAt.getTime() + 14 * 24 * 60 * 60 * 1000) },
            });
          }
        }
      }
    }

    const extras = await this.recordEventAndCourse(user, row, input);

    return { ...(await this.get(user, row.id)), ...extras };
  }

  async groupVaccinate(user: RequestUser, input: GroupVaccinate, requestId?: string) {
    const protocol = NEPAL_VACCINE_PROTOCOLS.find((p) => p.key === input.protocolKey);
    const animals = await this.prisma.animal.findMany({
      where: { id: { in: input.animalIds }, farmId: user.farmId, deletedAt: null },
    });
    const blocked: string[] = [];
    const created: HealthRecordDto[] = [];
    for (const animal of animals) {
      if (protocol?.blockPregnant && animal.isPregnant && !input.pregnantOverride) {
        blocked.push(animal.herdNumber ?? animal.tag);
        continue;
      }
      if (protocol?.blockPregnant && animal.isPregnant && input.pregnantOverride && !input.pregnantOverrideReason) {
        throw new BadRequestException({
          code: 'OVERRIDE_REASON_REQUIRED',
          message: 'Giving this vaccine to a pregnant animal needs a reason',
        });
      }
      created.push(
        await this.create(
          user,
          {
            type: protocol?.key === 'DEWORMING' ? 'DEWORMING' : 'VACCINATION',
            title: input.title,
            animalId: animal.id,
            performedAt: input.performedAt,
            batchNumber: input.batchNumber,
            milkWithholdUntil: input.milkWithholdUntil,
            meatWithholdUntil: input.meatWithholdUntil,
            notes: input.pregnantOverrideReason,
          },
          requestId,
        ),
      );
    }
    if (input.inventoryItemId && created.length) {
      const item = await this.prisma.inventoryItem.findFirst({
        where: { id: input.inventoryItemId, farmId: user.farmId, deletedAt: null },
      });
      if (item) {
        const next = Number(item.currentStock) - created.length;
        await this.prisma.inventoryItem.update({
          where: { id: item.id },
          data: { currentStock: next },
        });
        await this.prisma.stockMovement.create({
          data: {
            farmId: user.farmId,
            itemId: item.id,
            type: 'OUT',
            quantity: created.length,
            reason: `Group vaccinate ${input.title}`,
            userId: user.id,
          },
        });
      }
    }
    return { created: created.length, blocked, records: created };
  }

  async update(
    user: RequestUser,
    id: string,
    input: Partial<HealthCreate>,
    requestId?: string,
  ): Promise<HealthRecordDto> {
    await this.requireRecord(user.farmId, id);
    const row = await this.prisma.healthRecord.update({
      where: { id },
      data: {
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.animalId !== undefined ? { animalId: input.animalId } : {}),
        ...(input.groupId !== undefined ? { groupId: input.groupId } : {}),
        ...(input.herdBatchId !== undefined ? { herdBatchId: input.herdBatchId } : {}),
        ...(input.cost !== undefined ? { cost: input.cost } : {}),
        ...(input.performedAt !== undefined ? { performedAt: input.performedAt } : {}),
        ...(input.nextDueAt !== undefined ? { nextDueAt: input.nextDueAt } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.medicine !== undefined ? { medicine: input.medicine } : {}),
        ...(input.dosage !== undefined ? { dosage: input.dosage } : {}),
        ...(input.method !== undefined ? { method: input.method } : {}),
        ...(input.vetName !== undefined ? { vetName: input.vetName } : {}),
        ...(input.outcome !== undefined ? { outcome: input.outcome } : {}),
        ...(input.followUpAt !== undefined ? { followUpAt: input.followUpAt } : {}),
        ...(input.cmtResult !== undefined ? { cmtResult: input.cmtResult } : {}),
        ...(input.milkWithholdUntil !== undefined
          ? { milkWithholdUntil: input.milkWithholdUntil }
          : {}),
      },
      include: {
        animal: { select: { tag: true, name: true } },
        herdBatch: { select: { name: true } },
      },
    });
    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'health.update',
      entityType: 'healthRecord',
      entityId: row.id,
      requestId,
    });
    return toDto(row);
  }

  async remove(user: RequestUser, id: string, requestId?: string): Promise<void> {
    await this.requireRecord(user.farmId, id);
    await this.prisma.healthRecord.delete({ where: { id } });
    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'health.delete',
      entityType: 'healthRecord',
      entityId: id,
      requestId,
    });
  }

  async createUdderCheck(user: RequestUser, input: UdderCheckCreate): Promise<UdderCheckDto> {
    const animal = await this.prisma.animal.findFirst({
      where: { id: input.animalId, farmId: user.farmId, deletedAt: null },
    });
    if (!animal) {
      throw new NotFoundException({ code: 'ANIMAL_NOT_FOUND', message: 'Animal not found' });
    }
    const classification = classifyMastitis({
      quarterScores: input.quarterScores,
      appearance: input.appearance,
      signs: input.signs,
      sccThousand: input.sccThousand,
    });
    const quarters = affectedQuarters(input.quarterScores, classification);
    const checkDate = input.checkDate ?? new Date();
    const prior = await this.prisma.udderCheck.findMany({
      where: {
        farmId: user.farmId,
        animalId: animal.id,
        classification: 'SUBCLINICAL',
        ...(animal.lactationStartDate ? { checkDate: { gte: animal.lactationStartDate } } : {}),
      },
    });
    const chronicFlag = classification === 'SUBCLINICAL' && prior.length + 1 >= 3;
    const row = await this.prisma.udderCheck.create({
      data: {
        id: randomUUID(),
        farmId: user.farmId,
        animalId: animal.id,
        checkDate,
        method: input.method,
        quarterScores: input.quarterScores as Prisma.InputJsonValue,
        sccThousand: input.sccThousand,
        appearance: input.appearance,
        signs: input.signs,
        classification,
        affectedQuarters: quarters,
        discardMilk: classification === 'CLINICAL',
        chronicFlag,
        checkedById: user.id,
      },
    });
    if (chronicFlag) {
      await this.prisma.animal.update({
        where: { id: animal.id },
        data: { chronicMastitis: true },
      });
    }
    if (classification === 'CLINICAL') {
      await ensureTask(this.prisma, {
        farmId: user.farmId,
        animalId: animal.id,
        type: 'VET_URGENT',
        titleEn: `Treat clinical mastitis — ${animal.herdNumber ?? animal.tag}`,
        titleNp: `${animal.herdNumber ?? animal.tag} — देखिने मास्टिटिसको उपचार`,
        dueAt: new Date(),
        priority: 'HIGH',
        sourceRefType: 'udderCheck',
        sourceRefId: row.id,
      });
    }
    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'udder.check',
      entityType: 'udderCheck',
      entityId: row.id,
    });
    return toUdderDto(row);
  }

  async recordMortality(user: RequestUser, input: MortalityRecordCreate): Promise<MortalityRecordDto> {
    const animal = await this.prisma.animal.findFirst({
      where: { id: input.animalId, farmId: user.farmId, deletedAt: null },
    });
    if (!animal) {
      throw new NotFoundException({ code: 'ANIMAL_NOT_FOUND', message: 'Animal not found' });
    }
    const existing = await this.prisma.mortalityRecord.findUnique({ where: { animalId: animal.id } });
    if (existing) {
      throw new ConflictException({
        code: 'MORTALITY_EXISTS',
        message: 'A death record already exists for this animal',
      });
    }
    const cfg = this.speciesConfig ? await this.speciesConfig.forSpecies(animal.species) : null;
    const dim = daysInMilk(animal.lactationStartDate, input.deathAt);
    const latestMetric = await this.prisma.dailyMetric.findFirst({
      where: { farmId: user.farmId, animalId: animal.id },
      orderBy: { date: 'desc' },
    });
    const rearing = await this.prisma.dailyMetric.aggregate({
      where: { farmId: user.farmId, animalId: animal.id },
      _sum: { feedCostNpr: true, healthCostNpr: true, allocatedLabourNpr: true, otherCostNpr: true },
    });
    const rearingCost =
      Number(rearing._sum.feedCostNpr ?? 0) +
      Number(rearing._sum.healthCostNpr ?? 0) +
      Number(rearing._sum.allocatedLabourNpr ?? 0) +
      Number(rearing._sum.otherCostNpr ?? 0);
    const baseValue = animal.purchaseCost != null ? Number(animal.purchaseCost) : rearingCost;
    const price = this.profit ? (await this.profit.effectivePrice(user.farmId)).effectivePrice : 0;
    const remaining = remainingLactationValue({
      status: animal.status,
      daysInMilk: dim,
      lactationDays: cfg?.lactationDays ?? animal.expectedLactationDays ?? 0,
      rolling7Mean: latestMetric?.rolling7Mean != null ? Number(latestMetric.rolling7Mean) : null,
      effectivePriceNpr: price,
    });
    const loss = estimatedMortalityLoss(baseValue, remaining);
    const row = await this.prisma.mortalityRecord.create({
      data: {
        id: randomUUID(),
        farmId: user.farmId,
        animalId: animal.id,
        deathAt: input.deathAt,
        causeCategory: input.causeCategory,
        suspectedDisease: input.suspectedDisease,
        postMortemDone: input.postMortemDone ?? false,
        postMortemFindings: input.postMortemFindings,
        disposalMethod: input.disposalMethod,
        estimatedLossNpr: loss,
        insuranceClaimFiled: input.insuranceClaimFiled ?? false,
        insuranceClaimStatus: input.insuranceClaimStatus,
        reportedToVetOffice: input.reportedToVetOffice ?? false,
      },
    });
    await this.prisma.animal.update({
      where: { id: animal.id },
      data: { status: 'DEAD' },
    });
    await this.prisma.animalStatusHistory.create({
      data: {
        farmId: user.farmId,
        animalId: animal.id,
        fromStatus: animal.status,
        toStatus: 'DEAD',
        reason: input.causeCategory,
        changedBy: user.id,
      },
    });
    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'animal.mortality',
      entityType: 'mortalityRecord',
      entityId: row.id,
    });
    await this.reproStage?.recomputeAnimal(user.farmId, animal.id, 'DEAD');
    return {
      id: row.id,
      animalId: row.animalId,
      deathAt: row.deathAt.toISOString(),
      causeCategory: row.causeCategory,
      suspectedDisease: row.suspectedDisease,
      estimatedLossNpr: Number(row.estimatedLossNpr),
      remainingLactationValue: remaining,
      baseValue,
      postMortemDone: row.postMortemDone,
      disposalMethod: row.disposalMethod,
    };
  }

  private async recordEventAndCourse(
    user: RequestUser,
    row: HealthWithRelations,
    input: HealthCreate,
  ): Promise<Pick<HealthRecordDto, 'symptoms' | 'temperatureC' | 'temperatureOutOfRange' | 'severity' | 'provisionalDiagnosis'>> {
    let temperatureOut = false;
    if (input.animalId && this.prisma.healthEvent?.create) {
      const animal = await this.prisma.animal.findFirst({
        where: { id: input.animalId, farmId: user.farmId },
      });
      if (animal && this.speciesConfig && input.temperatureC != null) {
        const cfg = await this.speciesConfig.forSpecies(animal.species);
        temperatureOut = temperatureOutOfRange(input.temperatureC, cfg.tempMinC, cfg.tempMaxC);
      }
      const eventType =
        input.type === 'VACCINATION'
          ? 'VACCINATION'
          : input.type === 'DEWORMING'
            ? 'DEWORMING'
            : input.type === 'TREATMENT'
              ? 'TREATMENT'
              : 'OBSERVATION';
      const event = await this.prisma.healthEvent.create({
        data: {
          farmId: user.farmId,
          animalId: input.animalId,
          type: eventType,
          eventAt: input.performedAt,
          symptoms: input.symptoms ?? [],
          temperatureC: input.temperatureC,
          severity: input.severity,
          provisionalDiagnosis: input.provisionalDiagnosis,
          diagnosedBy: input.diagnosedBy ?? 'FARMER',
          vetName: input.vetName,
          outcome: input.outcome === 'RECOVERED' ? 'RECOVERED' : 'ONGOING',
          totalCostNpr: input.cost,
          notes: input.notes,
          healthRecordId: row.id,
        },
      });
      const freq =
        input.frequencyPerDay ??
        (input.doseIntervalHours ? Math.max(1, Math.round(24 / input.doseIntervalHours)) : 1);
      const duration = input.durationDays ?? 0;
      const remaining =
        duration > 0
          ? remainingDoseCount(duration, freq, 1)
          : input.doseCount
            ? Math.max(0, input.doseCount - 1)
            : 0;
      if (remaining > 0 || duration > 0) {
        await this.prisma.medicationAdministration.create({
          data: {
            id: randomUUID(),
            healthEventId: event.id,
            animalId: input.animalId,
            itemId: input.inventoryItemId,
            lotNumber: input.batchNumber,
            doseAmount: input.doseAmount ?? 1,
            route: input.route ?? 'INTRAMUSCULAR',
            frequencyPerDay: freq,
            durationDays: duration || 1,
            firstDoseAt: input.performedAt,
            dosesGiven: 1,
            costNpr: input.cost,
          },
        });
      }
      const hours = hoursBetweenDoses(freq);
      const total = remaining + 1;
      for (let i = 1; i <= remaining; i++) {
        await ensureTask(this.prisma, {
          farmId: user.farmId,
          animalId: input.animalId,
          type: 'MEDICATION_DOSE',
          titleEn: `Dose ${i + 1}/${total} — ${input.title}`,
          titleNp: `खुराक ${i + 1}/${total} — ${input.title}`,
          dueAt: new Date(input.performedAt.getTime() + i * hours * 60 * 60 * 1000),
          priority: 'HIGH',
          sourceRefType: 'medicationDose',
          sourceRefId: randomUUID(),
        });
      }
      if (input.type === 'TREATMENT') {
        for (const days of [3, 7]) {
          await ensureTask(this.prisma, {
            farmId: user.farmId,
            animalId: input.animalId,
            type: 'TREATMENT_FOLLOWUP',
            titleEn: `Treatment follow-up day ${days} — ${input.title}`,
            titleNp: `उपचार फलोअप दिन ${days} — ${input.title}`,
            dueAt: new Date(input.performedAt.getTime() + days * 24 * 60 * 60 * 1000),
            priority: 'NORMAL',
            sourceRefType: 'healthEventFollowup',
            sourceRefId: randomUUID(),
          });
        }
      }
    }
    return {
      symptoms: input.symptoms ?? [],
      temperatureC: input.temperatureC ?? null,
      temperatureOutOfRange: temperatureOut,
      severity: input.severity ?? null,
      provisionalDiagnosis: input.provisionalDiagnosis ?? null,
    };
  }

  private async requireRecord(farmId: string, id: string): Promise<HealthRecord> {
    const row = await this.prisma.healthRecord.findFirst({ where: { id, farmId } });
    if (!row) {
      throw new NotFoundException({
        code: 'HEALTH_RECORD_NOT_FOUND',
        message: 'Health record not found',
      });
    }
    return row;
  }
}

function toDto(r: HealthWithRelations): HealthRecordDto {
  return {
    id: r.id,
    farmId: r.farmId,
    type: r.type,
    title: r.title,
    animalId: r.animalId,
    groupId: r.groupId,
    herdBatchId: r.herdBatchId,
    animalTag: r.animal?.tag ?? null,
    animalName: r.animal?.name ?? null,
    herdBatchName: r.herdBatch?.name ?? null,
    cost: r.cost != null ? Number(r.cost) : null,
    medicine: r.medicine,
    dosage: r.dosage,
    method: r.method,
    vetName: r.vetName,
    outcome: r.outcome,
    followUpAt: r.followUpAt?.toISOString() ?? null,
    cmtResult: r.cmtResult,
    milkWithholdUntil: r.milkWithholdUntil?.toISOString() ?? null,
    meatWithholdUntil: r.meatWithholdUntil?.toISOString() ?? null,
    batchNumber: r.batchNumber,
    performedAt: r.performedAt.toISOString(),
    nextDueAt: r.nextDueAt?.toISOString() ?? null,
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function toUdderDto(row: {
  id: string;
  animalId: string;
  checkDate: Date;
  method: string;
  quarterScores: unknown;
  sccThousand: number | null;
  appearance: string;
  signs: string[];
  classification: string;
  affectedQuarters: string[];
  discardMilk: boolean;
  chronicFlag: boolean;
}): UdderCheckDto {
  return {
    id: row.id,
    animalId: row.animalId,
    checkDate: row.checkDate.toISOString(),
    method: row.method,
    quarterScores: row.quarterScores as QuarterScores,
    sccThousand: row.sccThousand,
    appearance: row.appearance,
    signs: row.signs,
    classification: row.classification as UdderCheckDto['classification'],
    affectedQuarters: row.affectedQuarters,
    discardMilk: row.discardMilk,
    chronicFlag: row.chronicFlag,
  };
}
