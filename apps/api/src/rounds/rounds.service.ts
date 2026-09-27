import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type {
  MilkSession,
  RecordingMode,
  RecordingRoundCreate,
  RecordingRoundDto,
  RecordingRoundFinish,
  RoundMetricsDto,
  RoundRemainingDto,
  ScanCreate,
  ScanResolveDto,
} from '@farm/contracts';
import { Prisma, type AnimalStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { RequestUser } from '../common/types';
import { ensureTask } from '../jobs/task-writer';
import { DAY_MS, EXIT_STATUSES, parseScanPayload, rankAnimalMatch, startOfUtcDay } from '../milk/milk-rules';
import { MilkService } from '../milk/milk.service';
import { PrismaService } from '../prisma/prisma.service';

const NEXT_ACTION: Record<RecordingMode, ScanResolveDto['nextAction']> = {
  MILKING: 'MILK_ENTRY',
  VACCINATION: 'DOSE_CONFIRM',
  TREATMENT: 'DOSE_CONFIRM',
  WEIGHING: 'WEIGHT_ENTRY',
  HEALTH_CHECK: 'SYMPTOM_PICKER',
  MARKER_PLACEMENT: 'MARKER_CONFIRM',
  BROWSE: 'PROFILE',
};

@Injectable()
export class RoundsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly milk: MilkService,
  ) {}

  async create(user: RequestUser, input: RecordingRoundCreate): Promise<RecordingRoundDto> {
    const date = startOfUtcDay(new Date());
    const session = input.mode === 'MILKING' ? (input.session ?? inferSession()) : (input.session ?? null);

    const existing = await this.prisma.recordingRound.findFirst({
      where: {
        farmId: user.farmId,
        status: 'ACTIVE',
        mode: input.mode,
        date,
        ...(session ? { session } : {}),
      },
      orderBy: { startedAt: 'desc' },
    });
    if (existing) return toRoundDto(existing);

    const expected = await this.expectedAnimals(user.farmId, input.mode);
    let milkRoundId: string | undefined;
    if (input.mode === 'MILKING' && session) {
      const milkRound = await this.milk.currentOrStart(user, { session, roundDate: date });
      milkRoundId = milkRound.id;
    }

    const created = await this.prisma.recordingRound.create({
      data: {
        farmId: user.farmId,
        mode: input.mode,
        session,
        date,
        operatorId: user.id,
        contextItemId: input.contextItemId,
        contextLotId: input.contextLotId,
        contextDose: input.contextDose,
        expectedCount: expected.length,
        milkRoundId,
        deviceId: input.deviceId,
      },
    });
    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'round.start',
      entityType: 'recordingRound',
      entityId: created.id,
      metadata: { mode: input.mode, session },
    });
    return toRoundDto(created);
  }

  async active(user: RequestUser): Promise<RecordingRoundDto | null> {
    const row = await this.prisma.recordingRound.findFirst({
      where: { farmId: user.farmId, status: 'ACTIVE' },
      orderBy: { startedAt: 'desc' },
    });
    return row ? toRoundDto(row) : null;
  }

  async remaining(user: RequestUser, id: string): Promise<RoundRemainingDto> {
    const round = await this.requireRound(user.farmId, id);
    const expected = await this.expectedAnimals(user.farmId, round.mode);
    const recordedIds = await this.recordedAnimalIds(round);
    const skipped = await this.prisma.roundSkip.findMany({ where: { roundId: round.id } });
    const skippedIds = new Set(skipped.map((s) => s.animalId));
    const remaining = expected.filter((a) => !recordedIds.has(a.id) && !skippedIds.has(a.id));
    return {
      round: toRoundDto(round),
      expected: expected.length,
      recorded: recordedIds.size,
      remaining: remaining.map((a) => ({
        id: a.id,
        shortNo: a.herdNumber,
        tag: a.tag,
        name: a.name,
        species: a.species,
        penName: a.shed,
        photoUrl: a.photoUrl,
        status: a.status,
        isPregnant: a.isPregnant,
        withholdActive: a.withholdUntil != null,
        usualLitres: a.usualLitres,
      })),
    };
  }

  async finish(user: RequestUser, id: string, input: RecordingRoundFinish): Promise<RecordingRoundDto> {
    const round = await this.requireRound(user.farmId, id);
    if (round.status !== 'ACTIVE') {
      throw new BadRequestException({ code: 'ROUND_CLOSED', message: 'This round is already closed' });
    }

    for (const skip of input.skips) {
      await this.prisma.roundSkip.upsert({
        where: { roundId_animalId: { roundId: round.id, animalId: skip.animalId } },
        update: { reason: skip.reason, note: skip.note },
        create: {
          roundId: round.id,
          animalId: skip.animalId,
          reason: skip.reason,
          note: skip.note,
        },
      });
      if (round.milkRoundId && (skip.reason === 'NOT_MILKED' || skip.reason === 'FORGOT')) {
        await this.prisma.milkRoundSkip.upsert({
          where: { roundId_animalId: { roundId: round.milkRoundId, animalId: skip.animalId } },
          update: { reason: skip.reason === 'FORGOT' ? 'FORGOT' : 'NOT_MILKED' },
          create: {
            roundId: round.milkRoundId,
            animalId: skip.animalId,
            reason: skip.reason === 'FORGOT' ? 'FORGOT' : 'NOT_MILKED',
          },
        });
      }
      if (skip.reason === 'FORGOT') {
        await ensureTask(this.prisma, {
          farmId: user.farmId,
          animalId: skip.animalId,
          type: 'MISSING_PRODUCTION',
          titleEn: 'Milk still not recorded',
          titleNp: 'दूध रेकर्ड बाँकी',
          dueAt: new Date(),
          priority: 'LOW',
          sourceRefType: 'recordingRound',
          sourceRefId: round.id,
        });
      }
    }

    const recordedIds = await this.recordedAnimalIds(round);
    const skippedCount = await this.prisma.roundSkip.count({ where: { roundId: round.id } });
    const litres = await this.totalLitres(round);
    const finishedAt = new Date();
    const durationSeconds = Math.max(1, Math.round((finishedAt.getTime() - round.startedAt.getTime()) / 1000));
    const handled = recordedIds.size + skippedCount;
    const secondsPerAnimal = handled > 0 ? durationSeconds / handled : null;

    const updated = await this.prisma.recordingRound.update({
      where: { id: round.id },
      data: {
        status: 'FINISHED',
        finishedAt,
        recordedCount: recordedIds.size,
        skippedCount,
        totalLitres: litres,
        durationSeconds,
        secondsPerAnimal,
      },
    });

    if (round.milkRoundId) {
      const milkRound = await this.prisma.milkRound.findFirst({
        where: { id: round.milkRoundId, farmId: user.farmId },
      });
      if (milkRound?.status === 'OPEN') {
        await this.milk.finish(user, milkRound.id);
      }
    }

    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'round.finish',
      entityType: 'recordingRound',
      entityId: round.id,
      metadata: { recordedCount: recordedIds.size, skippedCount, secondsPerAnimal },
    });
    return toRoundDto(updated);
  }

  async abandon(user: RequestUser, id: string): Promise<RecordingRoundDto> {
    const round = await this.requireRound(user.farmId, id);
    if (round.status !== 'ACTIVE') {
      throw new BadRequestException({ code: 'ROUND_CLOSED', message: 'This round is already closed' });
    }
    const updated = await this.prisma.recordingRound.update({
      where: { id: round.id },
      data: { status: 'ABANDONED', finishedAt: new Date() },
    });
    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'round.abandon',
      entityType: 'recordingRound',
      entityId: round.id,
    });
    return toRoundDto(updated);
  }

  async metrics(user: RequestUser, from?: Date, to?: Date): Promise<RoundMetricsDto> {
    const start = startOfUtcDay(from ?? new Date(Date.now() - 30 * DAY_MS));
    const end = startOfUtcDay(to ?? new Date());
    const rows = await this.prisma.recordingRound.findMany({
      where: { farmId: user.farmId, date: { gte: start, lte: end } },
    });
    const finished = rows.filter((r) => r.status === 'FINISHED');
    const abandoned = rows.filter((r) => r.status === 'ABANDONED');
    const recordedCount = finished.reduce((s, r) => s + r.recordedCount, 0);
    const skippedCount = finished.reduce((s, r) => s + r.skippedCount, 0);
    const expectedCount = finished.reduce((s, r) => s + (r.expectedCount ?? 0), 0);
    const seconds = finished
      .map((r) => (r.secondsPerAnimal != null ? Number(r.secondsPerAnimal) : null))
      .filter((n): n is number => n != null);
    return {
      from: start.toISOString(),
      to: end.toISOString(),
      rounds: rows.length,
      finished: finished.length,
      abandoned: abandoned.length,
      abandonRate: rows.length ? abandoned.length / rows.length : 0,
      recordedCount,
      skippedCount,
      completeness: expectedCount > 0 ? recordedCount / expectedCount : 0,
      avgSecondsPerAnimal: seconds.length ? seconds.reduce((a, b) => a + b, 0) / seconds.length : null,
      totalLitres: finished.reduce((s, r) => s + Number(r.totalLitres ?? 0), 0),
    };
  }

  async scan(user: RequestUser, input: ScanCreate): Promise<ScanResolveDto> {
    const parsed = parseScanPayload(input.rawPayload ?? '');
    const round = input.roundId ? await this.requireRound(user.farmId, input.roundId) : null;
    let animal = parsed.animalId
      ? await this.prisma.animal.findFirst({
          where: { id: parsed.animalId, farmId: user.farmId, deletedAt: null },
        })
      : null;

    if (!animal && parsed.query) {
      const hits = await this.resolveQuery(user.farmId, parsed.query);
      if (hits.length > 1) {
        await this.writeScan(user, input, null, false, 'AMBIGUOUS');
        throw new ConflictException({
          code: 'SCAN_AMBIGUOUS',
          message: 'More than one animal matches that number',
          details: hits.map((h) => ({ id: h.id, shortNo: h.herdNumber, species: h.species })),
        });
      }
      animal = hits[0] ?? null;
    }

    if (!animal) {
      await this.writeScan(user, input, null, false, 'NO_MATCH');
      throw new NotFoundException({ code: 'SCAN_NO_MATCH', message: 'No animal matched that scan' });
    }

    // Resolve before writing the scan event so "already recorded" is not the scan we just created.
    const dto = await this.resolveContext(user, animal.id, round);
    await this.writeScan(user, input, animal.id, true, null);
    return dto;
  }

  async resolveContext(
    user: RequestUser,
    animalId: string,
    round: { id: string; mode: RecordingMode; session: MilkSession | null; date: Date; milkRoundId: string | null } | null,
  ): Promise<ScanResolveDto> {
    const animal = await this.prisma.animal.findFirst({
      where: { id: animalId, farmId: user.farmId, deletedAt: null },
      include: {
        markers: { where: { removedAt: null } },
        health: {
          where: { milkWithholdUntil: { gte: new Date() } },
          orderBy: { milkWithholdUntil: 'desc' },
          take: 1,
        },
        production: {
          where: {
            type: 'MILK',
            entryDate: { gte: new Date(Date.now() - 8 * DAY_MS), lt: startOfUtcDay(new Date()) },
          },
          orderBy: { entryDate: 'desc' },
        },
      },
    });
    if (!animal) {
      throw new NotFoundException({ code: 'ANIMAL_NOT_FOUND', message: 'Animal not found' });
    }

    const milkHold = await this.prisma.milkWithhold.findFirst({
      where: { farmId: user.farmId, animalId: animal.id, clearedAt: null, endDate: { gte: new Date() } },
      orderBy: { endDate: 'desc' },
    });
    const withholdUntil = milkHold?.endDate ?? animal.health[0]?.milkWithholdUntil ?? null;
    const withholdDrug = milkHold?.drugName ?? animal.health[0]?.medicine ?? animal.health[0]?.title ?? null;
    const withhold = withholdUntil ? { milkWithholdUntil: withholdUntil, medicine: withholdDrug, title: withholdDrug } : null;
    const rolling7Mean =
      animal.production.length > 0
        ? animal.production.reduce((s, p) => s + Number(p.quantity), 0) / animal.production.length
        : null;

    let existing: { id: string; quantity: Prisma.Decimal } | null = null;
    if (round?.mode === 'MILKING' && round.session) {
      existing = await this.prisma.productionEntry.findFirst({
        where: {
          farmId: user.farmId,
          animalId: animal.id,
          type: 'MILK',
          session: round.session,
          entryDate: round.date,
        },
        select: { id: true, quantity: true },
      });
    } else if (round) {
      const prior = await this.prisma.scanEvent.findFirst({
        where: { farmId: user.farmId, roundId: round.id, animalId: animal.id, success: true },
      });
      if (prior) existing = { id: prior.id, quantity: new Prisma.Decimal(0) };
    }

    const daysInMilk = animal.lactationStartDate
      ? Math.floor((Date.now() - animal.lactationStartDate.getTime()) / DAY_MS)
      : null;
    const daysToCalving = animal.expectedCalvingDate
      ? Math.ceil((animal.expectedCalvingDate.getTime() - Date.now()) / DAY_MS)
      : null;

    return {
      animal: {
        id: animal.id,
        shortNo: animal.herdNumber,
        name: animal.name,
        nameNp: animal.name,
        species: animal.species,
        penName: animal.shed,
        photoUrl: animal.photoUrl,
      },
      status: {
        status: animal.status,
        isPregnant: animal.isPregnant,
        daysInMilk,
        daysToCalving,
      },
      blocks: withhold?.milkWithholdUntil
        ? [
            {
              kind: 'MILK_WITHHOLD',
              until: withhold.milkWithholdUntil.toISOString().slice(0, 10),
              drug: withhold.medicine ?? withhold.title,
              messageNp: 'दूध बेच्नु हुँदैन',
              blocksDisposal: ['SOLD'],
            },
          ]
        : [],
      markers: animal.markers.map((m) => ({
        reason: m.meaning === 'MILK_WITHHOLD' ? 'WITHHOLD' : m.meaning,
        colour: m.color,
        until: withhold?.milkWithholdUntil?.toISOString().slice(0, 10) ?? null,
      })),
      context: {
        rolling7Mean,
        alreadyRecordedThisRound: existing != null,
        existingValue: existing ? Number(existing.quantity) : null,
        existingEntryId: existing && round?.mode === 'MILKING' ? existing.id : null,
        expectedRangeLow: rolling7Mean != null ? round1(rolling7Mean * 0.6) : null,
        expectedRangeHigh: rolling7Mean != null ? round1(rolling7Mean * 1.4) : null,
      },
      nextAction: NEXT_ACTION[round?.mode ?? 'MILKING'],
    };
  }

  private async expectedAnimals(farmId: string, mode: RecordingMode) {
    const now = new Date();
    const notMilking: AnimalStatus[] = [...EXIT_STATUSES, 'DRY'];
    const terminal: AnimalStatus[] = [...EXIT_STATUSES];
    const where: Prisma.AnimalWhereInput =
      mode === 'MILKING'
        ? {
            farmId,
            deletedAt: null,
            gender: 'FEMALE',
            status: { notIn: notMilking },
          }
        : {
            farmId,
            deletedAt: null,
            status: { notIn: terminal },
          };
    const rows = await this.prisma.animal.findMany({
      where,
      include: {
        health: {
          where: { milkWithholdUntil: { gte: now } },
          orderBy: { milkWithholdUntil: 'desc' },
          take: 1,
        },
        production: {
          where: { type: 'MILK', entryDate: { gte: new Date(Date.now() - 7 * DAY_MS) } },
        },
      },
      orderBy: [{ shed: 'asc' }, { herdNumber: 'asc' }],
    });
    return rows.map((a) => ({
      ...a,
      withholdUntil: a.health[0]?.milkWithholdUntil ?? null,
      usualLitres:
        a.production.length > 0
          ? a.production.reduce((s, p) => s + Number(p.quantity), 0) / a.production.length
          : null,
    }));
  }

  private async recordedAnimalIds(round: {
    id: string;
    farmId: string;
    mode: RecordingMode;
    session: MilkSession | null;
    date: Date;
    milkRoundId: string | null;
  }): Promise<Set<string>> {
    if (round.mode === 'MILKING' && round.session) {
      const entries = await this.prisma.productionEntry.findMany({
        where: {
          farmId: round.farmId,
          type: 'MILK',
          session: round.session,
          entryDate: round.date,
          animalId: { not: null },
        },
        select: { animalId: true },
      });
      return new Set(entries.map((e) => e.animalId!).filter(Boolean));
    }
    const scans = await this.prisma.scanEvent.findMany({
      where: { roundId: round.id, success: true, animalId: { not: null } },
      select: { animalId: true },
    });
    return new Set(scans.map((s) => s.animalId!).filter(Boolean));
  }

  private async totalLitres(round: { farmId: string; mode: RecordingMode; session: MilkSession | null; date: Date }) {
    if (round.mode !== 'MILKING' || !round.session) return null;
    const agg = await this.prisma.productionEntry.aggregate({
      where: {
        farmId: round.farmId,
        type: 'MILK',
        session: round.session,
        entryDate: round.date,
      },
      _sum: { quantity: true },
    });
    return agg._sum.quantity != null ? Number(agg._sum.quantity) : 0;
  }

  private async resolveQuery(farmId: string, q: string) {
    const raw = q.trim();
    const rows = await this.prisma.animal.findMany({
      where: { farmId, deletedAt: null },
      take: 80,
    });
    return rows
      .map((a) => ({ animal: a, rank: rankAnimalMatch(raw, a) }))
      .filter((row): row is { animal: (typeof rows)[number]; rank: number } => row.rank != null)
      .sort((a, b) => a.rank - b.rank)
      .map((r) => r.animal);
  }

  private async writeScan(
    user: RequestUser,
    input: ScanCreate,
    animalId: string | null,
    success: boolean,
    failReason: string | null,
  ) {
    await this.prisma.scanEvent.create({
      data: {
        farmId: user.farmId,
        roundId: input.roundId,
        animalId,
        rawPayload: input.rawPayload,
        success,
        failReason,
        method: input.method,
        deviceId: input.deviceId,
      },
    });
  }

  private async requireRound(farmId: string, id: string) {
    const round = await this.prisma.recordingRound.findFirst({ where: { id, farmId } });
    if (!round) {
      throw new NotFoundException({ code: 'ROUND_NOT_FOUND', message: 'Recording round not found' });
    }
    return round;
  }
}

export function inferSession(): MilkSession {
  const hour = new Date().getHours();
  if (hour < 10) return 'MORNING';
  if (hour >= 15) return 'EVENING';
  return 'MIDDAY';
}

function toRoundDto(row: {
  id: string;
  mode: RecordingMode;
  session: MilkSession | null;
  date: Date;
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
  expectedCount: number | null;
  recordedCount: number;
  skippedCount: number;
  totalLitres: Prisma.Decimal | number | null;
  durationSeconds: number | null;
  secondsPerAnimal: Prisma.Decimal | number | null;
  milkRoundId: string | null;
}): RecordingRoundDto {
  return {
    id: row.id,
    mode: row.mode,
    session: row.session,
    date: row.date.toISOString(),
    status: row.status as RecordingRoundDto['status'],
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    expectedCount: row.expectedCount,
    recordedCount: row.recordedCount,
    skippedCount: row.skippedCount,
    totalLitres: row.totalLitres != null ? Number(row.totalLitres) : null,
    durationSeconds: row.durationSeconds,
    secondsPerAnimal: row.secondsPerAnimal != null ? Number(row.secondsPerAnimal) : null,
    milkRoundId: row.milkRoundId,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Kept so a withheld SOLD attempt can reuse the same 422 from milk entry. */
export function withholdActiveError(until: Date): never {
  throw new UnprocessableEntityException({
    code: 'MILK_WITHHOLD_ACTIVE',
    message: `Milk must not be sold until ${until.toISOString().slice(0, 10)}`,
    details: { withholdUntil: until.toISOString() },
  });
}
