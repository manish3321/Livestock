import { Injectable } from '@nestjs/common';
import type { ReproStage, Species, TaskType } from '@farm/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { SpeciesConfigService } from '../species-config/species-config.service';
import { nepalDayBounds } from '../notifications/notification-rules';
import { atNepalHour, nepalHourOf } from '../common/nepal-time';
import { ensureTask } from '../jobs/task-writer';
import { addDays } from './breeding-rules';
import { costOfOpenDays } from './breeding-anestrus';
import { SYSTEM_REMINDER_RULES, type ReminderRuleDef } from './reminder-catalog';
import {
  planReminders,
  resolveFarmRules,
  type PlannedReminder,
  type ReminderContext,
} from './reminder-engine';

const ANESTRUS_LADDER = new Set(['ANESTRUS_MINERAL', 'ANESTRUS_VET', 'ANESTRUS_DECISION']);
const OPEN_WINDOW_TYPES = ['rule:SERVICE_WINDOW_OPEN', 'rule:SERVICE_WINDOW_CLOSING'];

@Injectable()
export class ReminderEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly species: SpeciesConfigService,
  ) {}

  async rulesFor(farmId: string): Promise<ReminderRuleDef[]> {
    const rows = await this.prisma.reminderRule.findMany({
      where: { active: true, OR: [{ farmId: null }, { farmId }] },
    });
    if (rows.length === 0) return SYSTEM_REMINDER_RULES;
    const system = rows.filter((row) => row.farmId == null).map(toDef);
    const farm = rows.filter((row) => row.farmId === farmId).map(toDef);
    return resolveFarmRules(system.length ? system : SYSTEM_REMINDER_RULES, farm);
  }

  async fire(farmId: string, ctx: ReminderContext): Promise<number> {
    return this.fireFiltered(farmId, ctx);
  }

  async fireFiltered(
    farmId: string,
    ctx: ReminderContext,
    onlyCodes?: string[],
    opts?: { dueBy?: Date; notBefore?: Date },
  ): Promise<number> {
    const cfg = await this.species.forSpecies(ctx.species);
    const rules = await this.rulesFor(farmId);
    let planned = planReminders(rules, ctx, cfg);
    if (onlyCodes) planned = planned.filter((row) => onlyCodes.includes(row.code));
    const dueBy = opts?.dueBy;
    const notBefore = opts?.notBefore;
    if (dueBy) planned = planned.filter((row) => row.dueAt.getTime() <= dueBy.getTime());
    if (notBefore) planned = planned.filter((row) => row.dueAt.getTime() >= notBefore.getTime());
    const anestrusEnd = nepalDayBounds(ctx.now).end;
    planned = planned.filter(
      (row) => !ANESTRUS_LADDER.has(row.code) || row.dueAt.getTime() <= anestrusEnd.getTime(),
    );
    return this.write(farmId, ctx.animalId, planned);
  }

  async fireStageEntry(
    farmId: string,
    animal: {
      id: string;
      species: string;
      status: string;
      herdNumber: string | null;
      tag: string;
      lactationStartDate: Date | null;
      expectedCalvingDate: Date | null;
    },
    stage: ReproStage,
    now = new Date(),
  ): Promise<number> {
    const cfg = await this.species.forSpecies(animal.species as Species);
    const dim = animal.lactationStartDate
      ? Math.floor((now.getTime() - animal.lactationStartDate.getTime()) / DAY_MS)
      : 0;
    const quiet = Math.max(0, dim - cfg.voluntaryWaitingDays);
    const cost = await this.delayCost(farmId, animal, now);
    return this.fire(farmId, {
      enteredStage: stage,
      species: animal.species as Species,
      shortNo: animal.herdNumber ?? animal.tag,
      now,
      anchorAt: now,
      anchorId: animal.id,
      animalId: animal.id,
      status: animal.status,
      lactationStart: animal.lactationStartDate,
      expectedCalvingDate: animal.expectedCalvingDate,
      daysQuiet: quiet,
      costOfDelay: cost,
    });
  }

  async generateRepeating(farmId: string, now = new Date()): Promise<number> {
    return this.generateStageReminders(farmId, now);
  }

  /** Repeating stage rules for today. Idempotent via the pending-task unique index. */
  async generateStageReminders(farmId: string, now = new Date()): Promise<number> {
    const { end } = nepalDayBounds(now);
    const rules = (await this.rulesFor(farmId)).filter((row) => row.repeatEveryDays);
    if (rules.length === 0) return 0;
    const stages = [
      ...new Set(
        rules.flatMap((row) => [row.triggerStage, row.repeatUntilStage].filter(Boolean) as ReproStage[]),
      ),
    ];
    const animals = await this.prisma.animal.findMany({
      where: {
        farmId,
        deletedAt: null,
        gender: 'FEMALE',
        species: { in: ['BUFFALO', 'COW'] },
        ...(stages.length ? { reproStage: { in: stages } } : {}),
      },
    });
    let wrote = 0;
    for (const animal of animals) {
      const cfg = await this.species.forSpecies(animal.species as Species);
      const quiet = animal.lactationStartDate
        ? Math.max(
            0,
            Math.floor((now.getTime() - animal.lactationStartDate.getTime()) / DAY_MS) -
              cfg.voluntaryWaitingDays,
          )
        : 0;
      const planned = planReminders(
        rules.filter(
          (row) =>
            row.triggerStage === animal.reproStage || row.repeatUntilStage === animal.reproStage,
        ),
        {
          enteredStage: animal.reproStage as ReproStage,
          species: animal.species as Species,
          shortNo: animal.herdNumber ?? animal.tag,
          now,
          anchorAt: now,
          anchorId: animal.id,
          animalId: animal.id,
          status: animal.status,
          lactationStart: animal.lactationStartDate,
          expectedCalvingDate: animal.expectedCalvingDate,
          daysQuiet: quiet,
        },
        cfg,
      ).filter((row) => row.dueAt.getTime() <= end.getTime());
      wrote += await this.write(farmId, animal.id, planned);
    }
    wrote += await this.repeatHighRiskCalves(farmId, now, end);
    return wrote;
  }

  async generateEventReminders(farmId: string, now = new Date()): Promise<number> {
    const since = new Date(now.getTime() - 400 * DAY_MS);
    const heatSince = new Date(now.getTime() - 60 * DAY_MS);
    const notBefore = new Date(now.getTime() - 30 * DAY_MS);
    let wrote = 0;
    const calvings = await this.prisma.calvingEvent.findMany({
      where: { farmId, calvingAt: { gte: since }, outcome: { not: 'ABORTED' } },
      include: {
        dam: { select: { id: true, species: true, herdNumber: true, tag: true, status: true } },
        calves: { include: { animal: { select: { id: true, herdNumber: true, tag: true, species: true } } } },
      },
    });
    for (const event of calvings) {
      if (!event.dam) continue;
      wrote += await this.fireFiltered(
        farmId,
        {
          event: 'CALVING',
          species: event.dam.species as Species,
          shortNo: event.dam.herdNumber ?? event.dam.tag,
          now,
          anchorAt: event.calvingAt,
          anchorId: event.id,
          animalId: event.dam.id,
          status: event.dam.status,
          lactationStart: event.calvingAt,
          placentaExpelled: event.placentaExpelledWithin12h === true,
        },
        ['RETAINED_PLACENTA', 'POSTPARTUM_1', 'POSTPARTUM_2'],
        { notBefore },
      );
      for (const calf of event.calves) {
        if (!calf.animal) continue;
        wrote += await this.fireFiltered(farmId, {
          event: 'CALVING',
          species: (calf.animal.species as Species) ?? (event.dam.species as Species),
          shortNo: calf.animal.herdNumber ?? calf.animal.tag ?? event.dam.tag,
          now,
          anchorAt: event.calvingAt,
          anchorId: event.id,
          animalId: calf.animal.id,
        }, ['COLOSTRUM_1'], { notBefore });
      }
    }

    const services = await this.prisma.breedingService.findMany({
      where: { farmId, serviceDate: { gte: since } },
      include: {
        animal: {
          select: { species: true, herdNumber: true, tag: true, status: true, lactationStartDate: true },
        },
      },
    });
    for (const service of services) {
      if (!service.animal) continue;
      wrote += await this.fireFiltered(farmId, {
        event: 'SERVICE',
        species: service.animal.species as Species,
        shortNo: service.animal.herdNumber ?? service.animal.tag,
        now,
        anchorAt: service.serviceDate,
        anchorId: service.id,
        animalId: service.animalId,
        status: service.animal.status,
        lactationStart: service.animal.lactationStartDate,
        serviceCount: service.serviceNo,
      }, undefined, { notBefore });
      if (service.serviceNo >= 3) {
        wrote += await this.fireFiltered(farmId, {
          event: 'SERVICE_3',
          species: service.animal.species as Species,
          shortNo: service.animal.herdNumber ?? service.animal.tag,
          now,
          anchorAt: service.serviceDate,
          anchorId: service.id,
          animalId: service.animalId,
          serviceCount: service.serviceNo,
        }, undefined, { notBefore });
      }
    }

    const pregnant = await this.prisma.animal.findMany({
      where: {
        farmId,
        deletedAt: null,
        isPregnant: true,
        expectedCalvingDate: { not: null },
        species: { in: ['BUFFALO', 'COW'] },
      },
    });
    for (const animal of pregnant) {
      wrote += await this.fireFiltered(farmId, {
        event: 'PREG_CONFIRMED',
        species: animal.species as Species,
        shortNo: animal.herdNumber ?? animal.tag,
        now,
        anchorAt: animal.pregnancyConfirmedDate ?? now,
        anchorId: animal.id,
        animalId: animal.id,
        status: animal.status,
        expectedCalvingDate: animal.expectedCalvingDate,
      }, undefined, { notBefore });
    }

    const heats = await this.prisma.heatEvent.findMany({
      where: { farmId, observedAt: { gte: heatSince } },
      include: {
        animal: {
          select: {
            species: true,
            herdNumber: true,
            tag: true,
            status: true,
            lactationStartDate: true,
            isPregnant: true,
          },
        },
      },
    });
    for (const heat of heats) {
      if (!heat.animal) continue;
      const cfg = await this.species.forSpecies(heat.animal.species as Species);
      const dim =
        heat.animal.lactationStartDate != null
          ? (now.getTime() - heat.animal.lactationStartDate.getTime()) / DAY_MS
          : Number.POSITIVE_INFINITY;
      wrote += await this.fireFiltered(farmId, {
        event: 'HEAT',
        species: heat.animal.species as Species,
        shortNo: heat.animal.herdNumber ?? heat.animal.tag,
        now,
        anchorAt: heat.observedAt,
        anchorId: heat.id,
        animalId: heat.animalId,
        status: heat.animal.status,
        lactationStart: heat.animal.lactationStartDate,
        wasBred: heat.wasBred || heat.animal.isPregnant,
        inVoluntaryWait: dim < cfg.voluntaryWaitingDays,
      }, undefined, { notBefore });
    }
    return wrote;
  }

  async escalateAnestrus(farmId: string, now = new Date()): Promise<number> {
    const { end } = nepalDayBounds(now);
    const animals = await this.prisma.animal.findMany({
      where: {
        farmId,
        deletedAt: null,
        gender: 'FEMALE',
        species: { in: ['BUFFALO', 'COW'] },
        reproStage: { in: ['ANESTRUS_SUSPECTED', 'REPEAT_BREEDER'] },
      },
    });
    let wrote = 0;
    for (const animal of animals) {
      const cfg = await this.species.forSpecies(animal.species as Species);
      const dim = animal.lactationStartDate
        ? Math.floor((now.getTime() - animal.lactationStartDate.getTime()) / DAY_MS)
        : 0;
      const quiet = Math.max(0, dim - cfg.voluntaryWaitingDays);
      wrote += await this.fireFiltered(
        farmId,
        {
          enteredStage: animal.reproStage as ReproStage,
          species: animal.species as Species,
          shortNo: animal.herdNumber ?? animal.tag,
          now,
          anchorAt: animal.reproStageSince ?? animal.lactationStartDate ?? now,
          anchorId: animal.id,
          animalId: animal.id,
          status: animal.status,
          lactationStart: animal.lactationStartDate,
          expectedCalvingDate: animal.expectedCalvingDate,
          daysQuiet: quiet,
          costOfDelay: await this.delayCost(farmId, animal, now),
        },
        undefined,
        { dueBy: end },
      );
    }
    return wrote;
  }

  async checkServiceWindows(farmId: string, now = new Date()): Promise<number> {
    const since = new Date(now.getTime() - 7 * DAY_MS);
    const heats = await this.prisma.heatEvent.findMany({
      where: { farmId, observedAt: { gte: since } },
      include: {
        animal: {
          select: {
            species: true,
            herdNumber: true,
            tag: true,
            status: true,
            lactationStartDate: true,
            isPregnant: true,
          },
        },
      },
    });
    const rules = await this.rulesFor(farmId);
    let wrote = 0;
    for (const heat of heats) {
      if (!heat.animal || heat.wasBred || heat.animal.isPregnant) continue;
      const laterService = await this.prisma.breedingService.findFirst({
        where: {
          farmId,
          animalId: heat.animalId,
          serviceDate: { gte: heat.observedAt },
        },
      });
      if (laterService) continue;
      const cfg = await this.species.forSpecies(heat.animal.species as Species);
      const dim =
        heat.animal.lactationStartDate != null
          ? (now.getTime() - heat.animal.lactationStartDate.getTime()) / DAY_MS
          : Number.POSITIVE_INFINITY;
      const inWait = dim < cfg.voluntaryWaitingDays;
      const planned = planReminders(
        rules,
        {
          event: 'HEAT',
          species: heat.animal.species as Species,
          shortNo: heat.animal.herdNumber ?? heat.animal.tag,
          now,
          anchorAt: heat.observedAt,
          anchorId: heat.id,
          animalId: heat.animalId,
          status: heat.animal.status,
          lactationStart: heat.animal.lactationStartDate,
          wasBred: false,
          inVoluntaryWait: inWait,
        },
        cfg,
      );
      const closing = planned.find((row) => row.code === 'SERVICE_WINDOW_CLOSING');
      const missed = planned.find((row) => row.code === 'SERVICE_WINDOW_MISSED');
      const cycle = planned.find((row) => row.code === 'HEAT_WATCH_CYCLE');
      const windowEnd = missed?.dueAt;
      const closingAt = closing?.dueAt;
      if (windowEnd && now.getTime() >= windowEnd.getTime()) {
        await this.prisma.task.updateMany({
          where: {
            farmId,
            animalId: heat.animalId,
            type: 'SERVICE_WINDOW',
            status: { in: ['PENDING', 'SNOOZED'] },
            sourceRefType: { in: OPEN_WINDOW_TYPES },
          },
          data: { status: 'SUPERSEDED' },
        });
        const reopen = cycle
          ? {
              ...cycle,
              dueAt: atNepalHour(
                addDays(heat.observedAt, cfg.estrusCycleDays),
                nepalHourOf(cycle.dueAt),
              ),
            }
          : null;
        wrote += await this.write(farmId, heat.animalId, [missed, reopen].filter(Boolean) as PlannedReminder[]);
      } else if (
        closing &&
        closingAt &&
        windowEnd &&
        now.getTime() >= closingAt.getTime() &&
        now.getTime() < windowEnd.getTime()
      ) {
        wrote += await this.write(farmId, heat.animalId, [closing]);
      }
    }
    return wrote;
  }

  private async repeatHighRiskCalves(farmId: string, now: Date, dueBy: Date): Promise<number> {
    const calves = await this.prisma.animal.findMany({
      where: { farmId, deletedAt: null, highRiskFPT: true },
    });
    let wrote = 0;
    for (const calf of calves) {
      const feeding = await this.prisma.colostrumFeeding.findFirst({
        where: { farmId, animalId: calf.id },
        orderBy: { fedAt: 'asc' },
      });
      if (!feeding) continue;
      const cfg = await this.species.forSpecies(calf.species as Species);
      const rules = (await this.rulesFor(farmId)).filter((row) => row.code === 'CALF_HIGH_RISK');
      const planned = planReminders(
        rules,
        {
          event: 'COLOSTRUM_LATE',
          species: calf.species as Species,
          shortNo: calf.herdNumber ?? calf.tag,
          now,
          anchorAt: now,
          anchorId: feeding.id,
          animalId: calf.id,
        },
        cfg,
      ).map((row) => ({
        ...row,
        dueAt: atNepalHour(now, nepalHourOf(row.dueAt)),
      })).filter((row) => row.dueAt.getTime() <= dueBy.getTime());
      wrote += await this.write(farmId, calf.id, planned);
    }
    return wrote;
  }

  private async write(
    farmId: string,
    animalId: string,
    planned: PlannedReminder[],
  ): Promise<number> {
    let n = 0;
    for (const task of planned) {
      if (!task.repeating) {
        const existing = await this.prisma.task.findFirst({
          where: { farmId, sourceRefId: task.sourceRefId },
        });
        if (existing) continue;
      } else if (task.maxRepeats) {
        const count = await this.prisma.task.count({
          where: { farmId, animalId, sourceRefType: task.sourceRefType },
        });
        if (count >= task.maxRepeats) continue;
      }
      const id = await ensureTask(this.prisma, {
        farmId,
        animalId,
        type: task.taskType as TaskType,
        titleEn: task.titleEn,
        titleNp: task.titleNp,
        dueAt: task.dueAt,
        priority: task.priority,
        sourceRefType: task.sourceRefType,
        sourceRefId: task.sourceRefId,
      });
      if (id) n += 1;
    }
    return n;
  }

  private async delayCost(
    farmId: string,
    animal: { lactationStartDate: Date | null },
    now: Date,
  ): Promise<number> {
    if (!animal.lactationStartDate) return 0;
    const days = Math.floor((now.getTime() - animal.lactationStartDate.getTime()) / DAY_MS);
    const farm = await this.prisma.farm.findUnique({ where: { id: farmId } });
    const since = new Date(now.getTime() - 7 * DAY_MS);
    const metrics = await this.prisma.dailyMetric.findMany({
      where: { farmId, date: { gte: since } },
      select: { litres: true },
    });
    const yieldLitres =
      metrics.length > 0
        ? metrics.reduce((sum, row) => sum + Number(row.litres), 0) / metrics.length
        : 8;
    const price =
      farm?.effectivePriceNpr != null ? Number(farm.effectivePriceNpr) : Number(farm?.milkPriceNpr ?? 62);
    return costOfOpenDays(days, yieldLitres, price);
  }
}

function toDef(row: {
  code: string;
  taskType: string;
  triggerStage: string | null;
  triggerEvent: string | null;
  species: string[];
  offsetDays: number;
  offsetHours: number;
  fireAtHour: number | null;
  repeatEveryDays: number | null;
  repeatUntilStage: string | null;
  maxRepeats: number | null;
  priority: string;
  channels: string[];
  escalateAfterMinutes: number | null;
  escalateToRole: string | null;
  titleEn: string;
  titleNp: string;
  bodyEn: string | null;
  bodyNp: string | null;
  actionKeys: string[];
  active: boolean;
}): ReminderRuleDef {
  return {
    code: row.code,
    taskType: row.taskType as ReminderRuleDef['taskType'],
    triggerStage: (row.triggerStage as ReminderRuleDef['triggerStage']) ?? undefined,
    triggerEvent: row.triggerEvent ?? undefined,
    species: row.species as ReminderRuleDef['species'],
    offsetDays: row.offsetDays,
    offsetHours: row.offsetHours,
    fireAtHour: row.fireAtHour ?? undefined,
    repeatEveryDays: row.repeatEveryDays ?? undefined,
    repeatUntilStage: (row.repeatUntilStage as ReminderRuleDef['repeatUntilStage']) ?? undefined,
    maxRepeats: row.maxRepeats ?? undefined,
    priority: row.priority as ReminderRuleDef['priority'],
    channels: row.channels as ReminderRuleDef['channels'],
    escalateAfterMinutes: row.escalateAfterMinutes ?? undefined,
    escalateToRole: (row.escalateToRole as ReminderRuleDef['escalateToRole']) ?? undefined,
    titleEn: row.titleEn,
    titleNp: row.titleNp,
    bodyEn: row.bodyEn ?? undefined,
    bodyNp: row.bodyNp ?? undefined,
    actionKeys: row.actionKeys,
    active: row.active,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;
