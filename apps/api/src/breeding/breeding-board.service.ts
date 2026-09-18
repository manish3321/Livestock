import { Injectable, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import type {
  BreedingBoardDto,
  DecisionResolveInput,
  DryOffCompleteInput,
  HeatObservationInput,
  ProtocolSuggestDto,
  Role,
  SyncEnrollInput,
  TaskType,
} from '@farm/contracts';
import { DEFAULT_MARKER_SCHEME } from '@farm/contracts';
import { AuditService } from '../audit/audit.service';
import type { RequestUser } from '../common/types';
import { nepalCalendarDate, nepalDayBounds } from '../notifications/notification-rules';
import { PrismaService } from '../prisma/prisma.service';
import { SpeciesConfigService } from '../species-config/species-config.service';
import { completeOpenTask, ensureTask, supersedeOpenTasks } from '../jobs/task-writer';
import { atNepalHour } from '../common/nepal-time';
import { addDays, derivedSlotId } from './breeding-rules';
import { BreedingService } from './breeding.service';
import { ReproStageService } from './repro-stage.service';
import {
  BOARD_TASK_GROUP,
  DECISION_TASK_TYPES,
  type BoardAnimalRow,
  type BoardTaskRow,
  buildBreedingBoard,
} from './breeding-board';
import {
  aiStep,
  injectionSteps,
  isBuffaloLowSeason,
  protocolReason,
  seasonalWarning,
  suggestProtocolCode,
  type ProtocolStep,
} from './breeding-protocol';

const BOARD_TYPES: TaskType[] = [
  ...(Object.keys(BOARD_TASK_GROUP) as TaskType[]),
  ...DECISION_TASK_TYPES,
];

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class BreedingBoardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly speciesConfig: SpeciesConfigService,
    @Optional() private readonly reproStage?: ReproStageService,
    @Optional() private readonly breeding?: BreedingService,
  ) {}

  async getBoard(user: RequestUser, date?: string): Promise<BreedingBoardDto> {
    const day = date ?? nepalCalendarDate(new Date());
    const { start, end } = nepalDayBounds(new Date(`${day}T12:00:00+05:45`));
    const tasks = await this.prisma.task.findMany({
      where: {
        farmId: user.farmId,
        deletedAt: null,
        status: { in: ['PENDING', 'SNOOZED'] },
        type: { in: BOARD_TYPES },
        dueAt: { lt: end },
        animal: { deletedAt: null, species: { in: ['BUFFALO', 'COW'] } },
      },
      include: {
        animal: {
          include: {
            pen: true,
            breedingServices: { orderBy: { serviceDate: 'desc' }, take: 1 },
            heatEvents: { orderBy: { observedAt: 'desc' }, take: 1 },
          },
        },
      },
    });

    const animalIds = [...new Set(tasks.map((row) => row.animalId).filter(Boolean))] as string[];
    const enrollments = animalIds.length
      ? await this.prisma.syncEnrollment.findMany({
          where: { farmId: user.farmId, animalId: { in: animalIds }, status: 'ACTIVE' },
          include: { protocol: true },
        })
      : [];
    const enrollmentByAnimal = new Map(enrollments.map((row) => [row.animalId, row]));

    const boardTasks: BoardTaskRow[] = [];
    const animals: BoardAnimalRow[] = [];
    const seen = new Set<string>();

    for (const task of tasks) {
      const animal = task.animal;
      if (!animal) continue;
      const lastHeat = animal.heatEvents[0];
      const lastService = animal.breedingServices[0];
      const enrollment = enrollmentByAnimal.get(animal.id);
      const metadata = await this.taskMetadata(task.type, {
        dueAt: task.dueAt,
        lastHeatAt: lastHeat?.observedAt ?? null,
        lastServiceAt: lastService?.serviceDate ?? null,
        expectedCalving: animal.expectedCalvingDate,
        lactationStart: animal.lactationStartDate,
        estrusCycleDays: (await this.speciesConfig.forSpecies(animal.species)).estrusCycleDays,
        serviceWindowEndHours: (await this.speciesConfig.forSpecies(animal.species)).serviceWindowEndHours,
        enrollment,
      });
      boardTasks.push({
        id: task.id,
        type: task.type,
        titleEn: task.titleEn,
        titleNp: task.titleNp,
        dueAt: task.dueAt,
        priority: task.priority,
        animalId: animal.id,
        sourceRefType: task.sourceRefType,
        metadata,
      });
      if (seen.has(animal.id)) continue;
      seen.add(animal.id);
      animals.push({
        id: animal.id,
        herdNumber: animal.herdNumber,
        tag: animal.tag,
        name: animal.name,
        species: animal.species,
        shed: animal.shed,
        photoUrl: animal.photoUrl,
        penName: animal.pen?.name ?? animal.shed,
        penSortOrder: animal.pen?.sortOrder ?? 999,
        seqNo: animal.seqNo,
        technicianName: lastService?.technicianName,
        technicianPhone: lastService?.technicianPhone,
      });
    }

    return buildBreedingBoard({
      date: day,
      now: start,
      role: user.role as Role,
      tasks: boardTasks,
      animals,
    });
  }

  async getDecisions(user: RequestUser) {
    const board = await this.getBoard({ ...user, role: 'MANAGER' });
    return board.decisionQueue;
  }

  async recordHeatObservation(user: RequestUser, input: HeatObservationInput, requestId?: string) {
    const animal = await this.prisma.animal.findFirst({
      where: { id: input.animalId, farmId: user.farmId, deletedAt: null },
    });
    if (!animal) {
      throw new NotFoundException({ code: 'ANIMAL_NOT_FOUND', message: 'Animal not found' });
    }
    const observedAt = input.observedAt ?? new Date();
    if (input.observed) {
      return {
        id: input.taskId ?? animal.id,
        animalId: animal.id,
        observed: true,
        observedAt: observedAt.toISOString(),
        next: { form: 'heat' as const, animalId: animal.id, taskId: input.taskId ?? null },
      };
    }
    const row = await this.prisma.heatObservation.create({
      data: {
        farmId: user.farmId,
        animalId: animal.id,
        observedAt,
        observed: false,
        observerId: user.id,
        taskId: input.taskId,
      },
    });
    if (input.taskId) {
      await this.prisma.task.updateMany({
        where: { id: input.taskId, farmId: user.farmId, status: { in: ['PENDING', 'SNOOZED'] } },
        data: { status: 'DONE', completedAt: observedAt, completedById: user.id },
      });
    }
    if (!animal.isPregnant) {
      const label = animal.herdNumber ?? animal.tag;
      await ensureTask(this.prisma, {
        farmId: user.farmId,
        animalId: animal.id,
        type: 'HEAT_WATCH',
        titleEn: `Heat watch ${label}`,
        titleNp: `${label} रजस्वला हेर्ने`,
        dueAt: atNepalHour(addDays(observedAt, 1), 5),
        priority: 'NORMAL',
        sourceRefType: 'anestrus',
        sourceRefId: animal.id,
      });
    }
    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'breeding.heatObservation',
      entityType: 'heatObservation',
      entityId: row.id,
      metadata: { observed: false },
      requestId,
    });
    return {
      id: row.id,
      animalId: animal.id,
      observed: false,
      observedAt: observedAt.toISOString(),
      next: null,
    };
  }

  async listProtocols(species?: 'BUFFALO' | 'COW' | 'PIG' | 'GOAT') {
    const rows = await this.prisma.syncProtocol.findMany({
      where: {
        active: true,
        ...(species ? { species: { has: species } } : {}),
      },
      orderBy: { code: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      nameEn: row.nameEn,
      nameNp: row.nameNp,
      species: row.species,
      requiresCyclicity: row.requiresCyclicity,
      totalDays: row.totalDays,
      steps: row.steps,
      notesEn: row.notesEn,
      notesNp: row.notesNp,
      estimatedCostNpr: Number(row.estimatedCostNpr),
    }));
  }

  async suggestProtocol(user: RequestUser, animalId: string): Promise<ProtocolSuggestDto> {
    const animal = await this.prisma.animal.findFirst({
      where: { id: animalId, farmId: user.farmId, deletedAt: null },
    });
    if (!animal) {
      throw new NotFoundException({ code: 'ANIMAL_NOT_FOUND', message: 'Animal not found' });
    }
    const lastHeat = await this.prisma.heatEvent.findFirst({
      where: {
        farmId: user.farmId,
        animalId: animal.id,
        ...(animal.lactationStartDate ? { observedAt: { gte: animal.lactationStartDate } } : {}),
      },
      orderBy: { observedAt: 'desc' },
    });
    const quietFrom = lastHeat?.observedAt ?? animal.lactationStartDate ?? new Date();
    const daysQuiet = Math.floor((Date.now() - quietFrom.getTime()) / DAY_MS);
    const code = suggestProtocolCode(animal.species, daysQuiet);
    const protocol = await this.prisma.syncProtocol.findUnique({ where: { code } });
    if (!protocol) {
      throw new NotFoundException({ code: 'PROTOCOL_NOT_FOUND', message: 'Protocol seed missing' });
    }
    const reason = protocolReason(code, daysQuiet);
    const warning = seasonalWarning(animal.species, new Date().getUTCMonth());
    return {
      protocolId: protocol.id,
      code: protocol.code,
      nameEn: protocol.nameEn,
      nameNp: protocol.nameNp,
      daysQuiet,
      reasonEn: reason.reasonEn,
      reasonNp: reason.reasonNp,
      seasonalWarningEn: warning?.en ?? null,
      seasonalWarningNp: warning?.np ?? null,
      estimatedCostNpr: Number(protocol.estimatedCostNpr),
      requiresCyclicity: protocol.requiresCyclicity,
    };
  }

  async enroll(user: RequestUser, input: SyncEnrollInput, requestId?: string) {
    const animal = await this.prisma.animal.findFirst({
      where: { id: input.animalId, farmId: user.farmId, deletedAt: null },
    });
    if (!animal) {
      throw new NotFoundException({ code: 'ANIMAL_NOT_FOUND', message: 'Animal not found' });
    }
    const protocol = await this.prisma.syncProtocol.findFirst({
      where: { id: input.protocolId, active: true },
    });
    if (!protocol) {
      throw new NotFoundException({ code: 'PROTOCOL_NOT_FOUND', message: 'Protocol not found' });
    }
      const steps = ((protocol.steps as unknown) as ProtocolStep[]) ?? [];
    const month = input.startDate.getUTCMonth();
    const startedInLowSeason = animal.species === 'BUFFALO' && isBuffaloLowSeason(month);
    const warning = seasonalWarning(animal.species, month);
    const label = animal.herdNumber ?? animal.tag;

    const enrollment = await this.prisma.$transaction(async (tx) => {
      const row = await tx.syncEnrollment.create({
        data: {
          farmId: user.farmId,
          animalId: animal.id,
          protocolId: protocol.id,
          startDate: input.startDate,
          vetName: input.vetName,
          vetPhone: input.vetPhone,
          status: 'ACTIVE',
          estimatedCostNpr: protocol.estimatedCostNpr,
          startedInLowSeason,
        },
      });
      await supersedeOpenTasks(tx, {
        farmId: user.farmId,
        animalId: animal.id,
        types: ['HEAT_WATCH', 'SILENT_HEAT_CHECK'],
      });
      for (const step of injectionSteps(steps)) {
        const due = addDays(input.startDate, step.day);
        await ensureTask(tx, {
          farmId: user.farmId,
          animalId: animal.id,
          type: 'SYNC_INJECTION',
          titleEn: `${protocol.nameEn} day ${step.day} — ${step.drug}, ${step.dose} ${step.route}`,
          titleNp: `${protocol.nameNp} दिन ${step.day} — ${step.drugNp ?? step.drug}, ${step.dose}`,
          dueAt: due,
          priority: 'HIGH',
          sourceRefType: `sync:${row.id}`,
          sourceRefId: derivedSlotId(row.id, step.day),
        });
      }
      const ai = aiStep(steps);
      if (ai) {
        await ensureTask(tx, {
          farmId: user.farmId,
          animalId: animal.id,
          type: 'SYNC_AI',
          titleEn: `${protocol.nameEn} AI — ${ai.timing ?? 'morning'}`,
          titleNp: `${protocol.nameNp} गर्भाधान`,
          dueAt: addDays(input.startDate, ai.day),
          priority: 'HIGH',
          sourceRefType: `sync:${row.id}`,
          sourceRefId: derivedSlotId(row.id, 99),
        });
      }
      return row;
    });

    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'breeding.syncEnroll',
      entityType: 'syncEnrollment',
      entityId: enrollment.id,
      metadata: { protocol: protocol.code, startedInLowSeason },
      requestId,
    });

    await this.reproStage?.recomputeAnimal(user.farmId, animal.id, 'PROTOCOL');
    return {
      id: enrollment.id,
      animalId: animal.id,
      protocolId: protocol.id,
      code: protocol.code,
      startDate: input.startDate.toISOString().slice(0, 10),
      status: 'ACTIVE',
      startedInLowSeason,
      seasonalWarningEn: warning?.en ?? null,
      seasonalWarningNp: warning?.np ?? null,
      animalLabel: label,
    };
  }

  async cancelEnrollment(user: RequestUser, id: string, requestId?: string) {
    const enrollment = await this.prisma.syncEnrollment.findFirst({
      where: { id, farmId: user.farmId },
    });
    if (!enrollment) {
      throw new NotFoundException({ code: 'ENROLLMENT_NOT_FOUND', message: 'Enrollment not found' });
    }
    await this.prisma.syncEnrollment.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
    await this.prisma.task.updateMany({
      where: {
        farmId: user.farmId,
        animalId: enrollment.animalId,
        sourceRefType: `sync:${enrollment.id}`,
        status: { in: ['PENDING', 'SNOOZED'] },
      },
      data: { status: 'SUPERSEDED' },
    });
    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'breeding.syncCancel',
      entityType: 'syncEnrollment',
      entityId: id,
      requestId,
    });
    await this.reproStage?.recomputeAnimal(user.farmId, enrollment.animalId, 'PROTOCOL');
    return { id, status: 'CANCELLED' };
  }

  async listActiveEnrollments(user: RequestUser) {
    const rows = await this.prisma.syncEnrollment.findMany({
      where: { farmId: user.farmId, status: 'ACTIVE' },
      include: {
        protocol: true,
        animal: { select: { herdNumber: true, tag: true, name: true, species: true } },
      },
      orderBy: { startDate: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      animalId: row.animalId,
      shortNo: row.animal.herdNumber ?? row.animal.tag,
      name: row.animal.name,
      species: row.animal.species,
      protocolCode: row.protocol.code,
      protocolNameEn: row.protocol.nameEn,
      protocolNameNp: row.protocol.nameNp,
      startDate: row.startDate.toISOString().slice(0, 10),
      vetName: row.vetName,
      startedInLowSeason: row.startedInLowSeason,
    }));
  }

  async completeSyncTask(user: RequestUser, taskId: string, requestId?: string) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, farmId: user.farmId, status: { in: ['PENDING', 'SNOOZED'] } },
    });
    if (!task?.animalId) {
      throw new NotFoundException({ code: 'TASK_NOT_FOUND', message: 'Task not found' });
    }
    if (task.type !== 'SYNC_INJECTION' && task.type !== 'SYNC_AI') {
      throw new BadRequestException({ code: 'NOT_SYNC_TASK', message: 'Not a protocol task' });
    }
    await this.prisma.task.update({
      where: { id: task.id },
      data: { status: 'DONE', completedAt: new Date(), completedById: user.id },
    });
    void requestId;
    return { taskId: task.id, status: 'DONE', serviceId: null };
  }

  async resolveDecision(user: RequestUser, taskId: string, input: DecisionResolveInput, requestId?: string) {
    const task = await this.prisma.task.findFirst({
      where: {
        id: taskId,
        farmId: user.farmId,
        type: { in: DECISION_TASK_TYPES },
        status: { in: ['PENDING', 'SNOOZED'] },
      },
    });
    if (!task) {
      throw new NotFoundException({ code: 'TASK_NOT_FOUND', message: 'Decision not found' });
    }
    await this.prisma.task.update({
      where: { id: task.id },
      data: { status: 'DONE', completedAt: new Date(), completedById: user.id },
    });
    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'breeding.decisionResolve',
      entityType: 'task',
      entityId: task.id,
      metadata: { action: input.action },
      requestId,
    });
    return { taskId: task.id, action: input.action, status: 'DONE' };
  }

  async completeDryOff(user: RequestUser, input: DryOffCompleteInput, requestId?: string) {
    const animal = await this.prisma.animal.findFirst({
      where: { id: input.animalId, farmId: user.farmId, deletedAt: null },
    });
    if (!animal) {
      throw new NotFoundException({ code: 'ANIMAL_NOT_FOUND', message: 'Animal not found' });
    }
    if (input.stillPregnant === false) {
      return this.emptyAtDryOff(user, animal, requestId);
    }
    if (input.taskId) {
      await completeOpenTask(
        this.prisma,
        { farmId: user.farmId, type: 'DRY_OFF', animalId: animal.id },
        user.id,
      );
    } else {
      await completeOpenTask(
        this.prisma,
        { farmId: user.farmId, type: 'DRY_OFF', animalId: animal.id },
        user.id,
      );
    }
    await this.prisma.animal.update({
      where: { id: animal.id },
      data: { status: 'DRY' },
    });
    await this.prisma.animalStatusHistory.create({
      data: {
        farmId: user.farmId,
        animalId: animal.id,
        fromStatus: animal.status,
        toStatus: 'DRY',
        reason: 'Dried off',
        changedBy: user.id,
      },
    });
    const until = animal.expectedCalvingDate ?? addDays(new Date(), 60);
    const existing = await this.prisma.animalMarker.findFirst({
      where: { farmId: user.farmId, animalId: animal.id, meaning: 'DRY', removedAt: null },
    });
    if (!existing) {
      await this.prisma.animalMarker.create({
        data: {
          farmId: user.farmId,
          animalId: animal.id,
          color: DEFAULT_MARKER_SCHEME.DRY,
          meaning: 'DRY',
          placedById: user.id,
          validUntil: until,
        },
      });
    }
    await ensureTask(this.prisma, {
      farmId: user.farmId,
      animalId: animal.id,
      type: 'APPLY_MARKER',
      titleEn: `Yellow dry-off band on ${animal.herdNumber ?? animal.tag}`,
      titleNp: `${animal.herdNumber ?? animal.tag} मा पहेंलो दूध-बन्द ब्यान्ड`,
      dueAt: new Date(),
      priority: 'HIGH',
      sourceRefType: 'dryOff',
      sourceRefId: animal.id,
    });
    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'breeding.dryOff',
      entityType: 'animal',
      entityId: animal.id,
      requestId,
    });
    await this.reproStage?.recomputeAnimal(user.farmId, animal.id, 'STATUS');
    return { animalId: animal.id, status: 'DRY', driedOff: true };
  }

  /**
   * Dry-off is the last hands-on moment before she stops earning, so it is the
   * cheapest place to catch a pregnancy that was lost after diagnosis. Drying
   * off an empty animal costs the rest of the lactation and stays invisible
   * until she fails to calve, which for a buffalo is another ten months.
   */
  private async emptyAtDryOff(
    user: RequestUser,
    animal: { id: string; herdNumber: string | null; tag: string },
    requestId?: string,
  ) {
    await completeOpenTask(
      this.prisma,
      { farmId: user.farmId, type: 'DRY_OFF', animalId: animal.id },
      user.id,
    );
    const record = await this.prisma.breedingRecord.findFirst({
      where: {
        farmId: user.farmId,
        motherId: animal.id,
        pregnancyStatus: { in: ['PREGNANT', 'CONFIRMED'] },
      },
      orderBy: { matingDate: 'desc' },
    });
    if (record && this.breeding) {
      // Same path as an open pregnancy check: clears the pregnancy, fails the
      // service, and reopens heat watch. She really was examined, so it is a
      // PregnancyCheck row, not a special case.
      await this.breeding.pregnancyCheck(
        user,
        record.id,
        { result: 'NOT_PREGNANT', checkDate: new Date() },
        requestId,
      );
    } else {
      await this.prisma.animal.update({
        where: { id: animal.id },
        data: { isPregnant: false, expectedCalvingDate: null, pregnancyConfirmedDate: null },
      });
      await supersedeOpenTasks(this.prisma, {
        farmId: user.farmId,
        animalId: animal.id,
        types: ['CALVING_WATCH', 'DRY_OFF', 'FEED_TRANSITION'],
      });
      const label = animal.herdNumber ?? animal.tag;
      await ensureTask(this.prisma, {
        farmId: user.farmId,
        animalId: animal.id,
        type: 'HEAT_WATCH',
        titleEn: `Heat watch — ${label} was empty at dry-off`,
        titleNp: `${label} दूध बन्द गर्दा गर्भ थिएन — रजस्वला हेर्ने`,
        dueAt: atNepalHour(addDays(new Date(), 2), 5),
        priority: 'HIGH',
        sourceRefType: 'dryOff',
        sourceRefId: animal.id,
      });
      await this.reproStage?.recomputeAnimal(user.farmId, animal.id, 'SERVICE');
    }
    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'breeding.dryOff.empty',
      entityType: 'animal',
      entityId: animal.id,
      metadata: { stillPregnant: false },
      requestId,
    });
    return { animalId: animal.id, status: 'OPEN', driedOff: false, pregnancyCleared: true };
  }

  private async taskMetadata(
    type: TaskType,
    args: {
      dueAt: Date;
      lastHeatAt: Date | null;
      lastServiceAt: Date | null;
      expectedCalving: Date | null;
      lactationStart: Date | null;
      estrusCycleDays: number;
      serviceWindowEndHours: number;
      enrollment?: { startDate: Date; protocol: { code: string; nameEn: string; steps: unknown } };
    },
  ): Promise<Record<string, string | number | null | undefined>> {
    const now = new Date();
    if (type === 'SERVICE_WINDOW' || type === 'SYNC_AI') {
      const heat = args.lastHeatAt ?? args.dueAt;
      const deadline = args.lastHeatAt
        ? new Date(args.lastHeatAt.getTime() + args.serviceWindowEndHours * 60 * 60 * 1000)
        : args.dueAt;
      return {
        time: formatClock(heat),
        deadline: formatClock(deadline),
        deadlineIso: deadline.toISOString(),
      };
    }
    if (type === 'HEAT_WATCH') {
      const from = args.lastHeatAt ?? args.lactationStart ?? now;
      const n = Math.max(1, Math.round((now.getTime() - from.getTime()) / DAY_MS) % args.estrusCycleDays || args.estrusCycleDays);
      return { n };
    }
    if (type === 'SILENT_HEAT_CHECK') {
      const from = args.lastHeatAt ?? args.lactationStart ?? now;
      return { n: Math.floor((now.getTime() - from.getTime()) / DAY_MS) };
    }
    if (type === 'PREGNANCY_CHECK' && args.lastServiceAt) {
      return { n: Math.floor((now.getTime() - args.lastServiceAt.getTime()) / DAY_MS) };
    }
    if ((type === 'CALVING_WATCH' || type === 'DRY_OFF') && args.expectedCalving) {
      return { n: Math.max(0, Math.ceil((args.expectedCalving.getTime() - now.getTime()) / DAY_MS)) };
    }
    if (type === 'POSTPARTUM_CHECK' && args.lactationStart) {
      return { n: Math.floor((now.getTime() - args.lactationStart.getTime()) / DAY_MS) };
    }
    if (type === 'SYNC_INJECTION' && args.enrollment) {
      const day = Math.round((args.dueAt.getTime() - args.enrollment.startDate.getTime()) / DAY_MS);
      const steps = ((args.enrollment.protocol.steps as unknown) as ProtocolStep[]) ?? [];
      const step = steps.find((row) => row.day === day);
      return {
        n: day,
        protocol: args.enrollment.protocol.nameEn ?? args.enrollment.protocol.code,
        drug: step?.drug ?? '',
        dose: step?.dose ?? '',
      };
    }
    return {};
  }
}

function formatClock(date: Date): string {
  return date.toLocaleTimeString('en-GB', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kathmandu',
  });
}
