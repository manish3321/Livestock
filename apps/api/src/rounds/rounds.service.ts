import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
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
  RoundTodayDto,
  RoundTodayQuery,
  ScanCreate,
  ScanResolveDto,
} from '@farm/contracts';
import { Prisma, type AnimalStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { RequestUser } from '../common/types';
import { ensureTask } from '../jobs/task-writer';
import { DAY_MS, EXIT_STATUSES, parseScanPayload, rankAnimalMatch, startOfUtcDay } from '../milk/milk-rules';
import { MilkService } from '../milk/milk.service';
import { nepalDayBounds } from '../notifications/notification-rules';
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
  private readonly logger = new Logger(RoundsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly milk: MilkService,
  ) {}

  private async timed<T>(label: string, run: () => Promise<T>): Promise<T> {
    const t0 = Date.now();
    try {
      return await run();
    } finally {
      this.logger.log(`progress.query ${label} ${Date.now() - t0}ms`);
    }
  }

  async create(user: RequestUser, input: RecordingRoundCreate): Promise<RecordingRoundDto> {
    await this.abandonStale(user);
    const date = startOfUtcDay(new Date());
    const session = input.mode === 'MILKING' ? (input.session ?? inferSession()) : (input.session ?? null);

    const existing = await this.prisma.recordingRound.findFirst({
      where: {
        farmId: user.farmId,
        status: 'ACTIVE',
        mode: input.mode,
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
      // One MilkRound per farm/day/session; RecordingRound.milkRoundId is unique.
      // After finish/abandon the link still blocks a new open pad — free it and reopen milk.
      const prior = await this.prisma.recordingRound.findFirst({
        where: { milkRoundId },
        select: { id: true, status: true },
      });
      if (prior?.status === 'ACTIVE') return toRoundDto(await this.requireRound(user.farmId, prior.id));
      if (prior) {
        await this.prisma.recordingRound.update({
          where: { id: prior.id },
          data: { milkRoundId: null },
        });
      }
      if (milkRound.status !== 'OPEN') {
        await this.prisma.milkRound.update({
          where: { id: milkRoundId },
          data: { status: 'OPEN', finishedAt: null },
        });
      }
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

  async active(
    user: RequestUser,
    mode?: RecordingMode,
    session?: MilkSession | null,
  ): Promise<RecordingRoundDto | null> {
    await this.abandonStale(user);
    // Nepal morning can start before UTC midnight, so keep anything still ACTIVE after cleanup.
    const row = await this.prisma.recordingRound.findFirst({
      where: {
        farmId: user.farmId,
        status: 'ACTIVE',
        ...(mode ? { mode } : {}),
        ...(mode === 'MILKING' && session ? { session } : {}),
      },
      orderBy: { startedAt: 'desc' },
    });
    return row ? toRoundDto(row) : null;
  }

  /**
   * A round left open from an earlier Nepal day would hijack the shed forever.
   * Cut off at Nepal midnight so yesterday's evening milking cannot block today's work,
   * while a Nepal morning that started just before UTC midnight stays open.
   */
  private async abandonStale(user: RequestUser): Promise<void> {
    const { start: nepalTodayStart } = nepalDayBounds(new Date());
    const stale = await this.prisma.recordingRound.findMany({
      where: {
        farmId: user.farmId,
        status: 'ACTIVE',
        startedAt: { lt: nepalTodayStart },
      },
      select: { id: true },
    });
    if (stale.length === 0) return;
    await this.prisma.recordingRound.updateMany({
      where: { id: { in: stale.map((r) => r.id) }, status: 'ACTIVE' },
      data: { status: 'ABANDONED', finishedAt: new Date() },
    });
    for (const round of stale) {
      await this.audit.record({
        farmId: user.farmId,
        userId: user.id,
        action: 'round.abandon',
        entityType: 'recordingRound',
        entityId: round.id,
        metadata: { reason: 'stale' },
      });
    }
  }

  async remaining(user: RequestUser, id: string): Promise<RoundRemainingDto> {
    // Milking: one SQL round-trip (roster + recorded + skips + round row).
    // Remote Supabase RTT ~700ms; sequential Prisma finds stacked to ~2s.
    if (typeof this.prisma.$queryRaw === 'function') {
      const bundled = await this.timed('milkingRemainingOneShot', () =>
        this.milkingRemainingOneShot(user.farmId, id),
      );
      if (bundled) return bundled;
    }
    const round = await this.requireRound(user.farmId, id);
    return { round: toRoundDto(round), ...(await this.progress(round)) };
  }

  async today(user: RequestUser, query: RoundTodayQuery): Promise<RoundTodayDto> {
    const date = startOfUtcDay(new Date());
    const session = query.mode === 'MILKING' ? (query.session ?? inferSession()) : null;
    // Do not call abandonStale here — shed "today" must stay a read.
    if (query.mode === 'MILKING' && session && typeof this.prisma.$queryRaw === 'function') {
      const bundled = await this.timed('milkingTodayOneShot', () =>
        this.milkingTodayOneShot(user.farmId, session, date),
      );
      return {
        mode: query.mode,
        session,
        round: bundled.round,
        expected: bundled.expected,
        recorded: bundled.recorded,
        remaining: bundled.remaining,
      };
    }
    const round = await this.prisma.recordingRound.findFirst({
      where: {
        farmId: user.farmId,
        mode: query.mode,
        date,
        status: { not: 'ABANDONED' },
        ...(session ? { session } : {}),
      },
      orderBy: { startedAt: 'desc' },
    });
    const progress = await this.progress(
      round ?? { id: '', farmId: user.farmId, mode: query.mode, session, date, milkRoundId: null },
    );
    return {
      mode: query.mode,
      session,
      round: round ? toRoundDto(round) : null,
      ...progress,
    };
  }

  /**
   * One Postgres round-trip for milking remaining: round row + roster (with
   * active withhold flag) + recorded animal ids + skips. usualLitres stays null.
   */
  private async milkingRemainingOneShot(
    farmId: string,
    roundId: string,
  ): Promise<RoundRemainingDto | null> {
    type Row = MilkingProgressRow & RoundRowCols;
    const rows = await this.prisma.$queryRaw<Row[]>`
      WITH round AS (
        SELECT r.id, r.mode, r.session, r.date, r.status, r."startedAt", r."finishedAt",
               r."expectedCount", r."recordedCount", r."skippedCount", r."totalLitres",
               r."durationSeconds", r."secondsPerAnimal", r."milkRoundId", r."farmId"
        FROM "RecordingRound" r
        WHERE r.id = ${roundId}::uuid AND r."farmId" = ${farmId}::uuid
      ),
      withholds AS (
        SELECT DISTINCT ON (h."animalId") h."animalId", h."milkWithholdUntil" AS withhold
        FROM "HealthRecord" h
        JOIN round r ON r."farmId" = h."farmId"
        WHERE h."milkWithholdUntil" >= NOW() AND h."animalId" IS NOT NULL
        ORDER BY h."animalId", h."milkWithholdUntil" DESC
      ),
      roster AS (
        SELECT a.id, a."herdNumber", a.tag, a.name, a.species, a.shed, a."photoUrl",
               a.status, a."isPregnant", w.withhold
        FROM "Animal" a
        CROSS JOIN round r
        LEFT JOIN withholds w ON w."animalId" = a.id
        WHERE a."farmId" = r."farmId"
          AND a."deletedAt" IS NULL
          AND a.gender = 'FEMALE'
          AND a.status::text NOT IN ('SOLD', 'DEAD', 'CULLED', 'DRY')
      ),
      recorded AS (
        SELECT DISTINCT pe."animalId"
        FROM "ProductionEntry" pe
        CROSS JOIN round r
        WHERE pe."farmId" = r."farmId"
          AND pe.type = 'MILK'
          AND pe.session = r.session
          AND pe."entryDate" = r.date
          AND pe."animalId" IS NOT NULL
      ),
      skipped AS (
        SELECT s."animalId"
        FROM "RoundSkip" s
        JOIN round r ON r.id = s."roundId"
      )
      SELECT r.id AS "roundId", r.mode, r.session, r.date, r.status, r."startedAt", r."finishedAt",
             r."expectedCount", r."recordedCount", r."skippedCount", r."totalLitres",
             r."durationSeconds", r."secondsPerAnimal", r."milkRoundId",
             o.id AS "animalId", o."herdNumber", o.tag, o.name, o.species, o.shed, o."photoUrl",
             o.status AS "animalStatus", o."isPregnant", o.withhold,
             (rec."animalId" IS NOT NULL) AS recorded,
             (sk."animalId" IS NOT NULL) AS skipped
      FROM round r
      LEFT JOIN roster o ON true
      LEFT JOIN recorded rec ON rec."animalId" = o.id
      LEFT JOIN skipped sk ON sk."animalId" = o.id
      ORDER BY o.shed ASC NULLS LAST, o."herdNumber" ASC NULLS LAST
    `;
    if (rows.length === 0) {
      throw new NotFoundException({ code: 'ROUND_NOT_FOUND', message: 'Recording round not found' });
    }
    if (rows[0]!.mode !== 'MILKING') return null;
    return this.bundleFromMilkingRows(rows);
  }

  private async milkingTodayOneShot(
    farmId: string,
    session: MilkSession,
    date: Date,
  ): Promise<{
    round: RecordingRoundDto | null;
    expected: number;
    recorded: number;
    remaining: RoundRemainingDto['remaining'];
  }> {
    type Row = MilkingProgressRow & Partial<RoundRowCols> & { roundId: string | null };
    const rows = await this.prisma.$queryRaw<Row[]>`
      WITH round AS (
        SELECT r.id, r.mode, r.session, r.date, r.status, r."startedAt", r."finishedAt",
               r."expectedCount", r."recordedCount", r."skippedCount", r."totalLitres",
               r."durationSeconds", r."secondsPerAnimal", r."milkRoundId", r."farmId"
        FROM "RecordingRound" r
        WHERE r."farmId" = ${farmId}::uuid
          AND r.mode = 'MILKING'
          AND r.date = ${date}
          AND r.session = ${session}::"MilkSession"
          AND r.status <> 'ABANDONED'
        ORDER BY r."startedAt" DESC
        LIMIT 1
      ),
      withholds AS (
        SELECT DISTINCT ON (h."animalId") h."animalId", h."milkWithholdUntil" AS withhold
        FROM "HealthRecord" h
        WHERE h."farmId" = ${farmId}::uuid
          AND h."milkWithholdUntil" >= NOW()
          AND h."animalId" IS NOT NULL
        ORDER BY h."animalId", h."milkWithholdUntil" DESC
      ),
      roster AS (
        SELECT a.id, a."herdNumber", a.tag, a.name, a.species, a.shed, a."photoUrl",
               a.status, a."isPregnant", w.withhold
        FROM "Animal" a
        LEFT JOIN withholds w ON w."animalId" = a.id
        WHERE a."farmId" = ${farmId}::uuid
          AND a."deletedAt" IS NULL
          AND a.gender = 'FEMALE'
          AND a.status::text NOT IN ('SOLD', 'DEAD', 'CULLED', 'DRY')
      ),
      recorded AS (
        SELECT DISTINCT pe."animalId"
        FROM "ProductionEntry" pe
        WHERE pe."farmId" = ${farmId}::uuid
          AND pe.type = 'MILK'
          AND pe.session = ${session}::"MilkSession"
          AND pe."entryDate" = ${date}
          AND pe."animalId" IS NOT NULL
      ),
      skipped AS (
        SELECT s."animalId"
        FROM "RoundSkip" s
        JOIN round r ON r.id = s."roundId"
      )
      SELECT r.id AS "roundId", r.mode, r.session, r.date, r.status, r."startedAt", r."finishedAt",
             r."expectedCount", r."recordedCount", r."skippedCount", r."totalLitres",
             r."durationSeconds", r."secondsPerAnimal", r."milkRoundId",
             o.id AS "animalId", o."herdNumber", o.tag, o.name, o.species, o.shed, o."photoUrl",
             o.status AS "animalStatus", o."isPregnant", o.withhold,
             (rec."animalId" IS NOT NULL) AS recorded,
             (sk."animalId" IS NOT NULL) AS skipped
      FROM roster o
      LEFT JOIN round r ON true
      LEFT JOIN recorded rec ON rec."animalId" = o.id
      LEFT JOIN skipped sk ON sk."animalId" = o.id
      ORDER BY o.shed ASC NULLS LAST, o."herdNumber" ASC NULLS LAST
    `;
    if (rows.length === 0) {
      return { round: null, expected: 0, recorded: 0, remaining: [] };
    }
    const first = rows[0]!;
    const recordedIds = new Set(
      rows.filter((x) => x.recorded && x.animalId).map((x) => x.animalId as string),
    );
    const remaining = rows
      .filter((x) => x.animalId && !x.recorded && !x.skipped)
      .map((x) => milkingAnimalDto(x));
    return {
      round: first.roundId
        ? toRoundDto({
            id: first.roundId,
            mode: 'MILKING',
            session: first.session ?? session,
            date: first.date ?? date,
            status: first.status ?? 'ACTIVE',
            startedAt: first.startedAt ?? date,
            finishedAt: first.finishedAt ?? null,
            expectedCount: first.expectedCount ?? null,
            recordedCount: first.recordedCount ?? 0,
            skippedCount: first.skippedCount ?? 0,
            totalLitres: first.totalLitres ?? null,
            durationSeconds: first.durationSeconds ?? null,
            secondsPerAnimal: first.secondsPerAnimal ?? null,
            milkRoundId: first.milkRoundId ?? null,
          })
        : null,
      expected: rows.filter((x) => x.animalId).length,
      recorded: recordedIds.size,
      remaining,
    };
  }

  private bundleFromMilkingRows(
    rows: Array<MilkingProgressRow & RoundRowCols>,
  ): RoundRemainingDto {
    const head = rows[0]!;
    const animals = rows.filter((x) => x.animalId);
    const recordedIds = new Set(animals.filter((x) => x.recorded).map((x) => x.animalId as string));
    const remaining = animals.filter((x) => !x.recorded && !x.skipped).map((x) => milkingAnimalDto(x));
    return {
      round: toRoundDto({
        id: head.roundId,
        mode: head.mode as RecordingMode,
        session: head.session,
        date: head.date,
        status: head.status,
        startedAt: head.startedAt,
        finishedAt: head.finishedAt,
        expectedCount: head.expectedCount,
        recordedCount: head.recordedCount,
        skippedCount: head.skippedCount,
        totalLitres: head.totalLitres,
        durationSeconds: head.durationSeconds,
        secondsPerAnimal: head.secondsPerAnimal,
        milkRoundId: head.milkRoundId,
      }),
      expected: animals.length,
      recorded: recordedIds.size,
      remaining,
    };
  }

  private async progress(round: {
    id: string;
    farmId: string;
    mode: RecordingMode;
    session: MilkSession | null;
    date: Date;
    milkRoundId: string | null;
  }): Promise<Omit<RoundRemainingDto, 'round'>> {
    const needRecorded = Boolean(round.id) || round.mode === 'MILKING';
    const t0 = Date.now();
    const [expected, recordedIds, skipped] = await Promise.all([
      this.timed('expectedAnimals', () => this.expectedAnimals(round.farmId, round.mode)),
      needRecorded
        ? this.timed('recordedAnimalIds', () => this.recordedAnimalIds(round))
        : Promise.resolve(new Set<string>()),
      round.id
        ? this.timed('roundSkips', () =>
            this.prisma.roundSkip.findMany({
              where: { roundId: round.id },
              select: { animalId: true },
            }),
          )
        : Promise.resolve([] as { animalId: string }[]),
    ]);
    const skippedIds = new Set(skipped.map((s) => s.animalId));
    const remaining = expected.filter((a) => !recordedIds.has(a.id) && !skippedIds.has(a.id));
    this.logger.log(
      `progress.total ${Date.now() - t0}ms mode=${round.mode} session=${round.session ?? '-'} expected=${expected.length} recorded=${recordedIds.size} remaining=${remaining.length}`,
    );
    return {
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

    // Apply skips in parallel — sequential upserts made finish feel slow on large leftovers.
    await Promise.all(
      input.skips.map((skip) =>
        this.prisma.roundSkip.upsert({
          where: { roundId_animalId: { roundId: round.id, animalId: skip.animalId } },
          update: { reason: skip.reason, note: skip.note },
          create: {
            roundId: round.id,
            animalId: skip.animalId,
            reason: skip.reason,
            note: skip.note,
          },
        }),
      ),
    );
    await Promise.all(
      input.skips.flatMap((skip) => {
        const jobs: Promise<unknown>[] = [];
        if (round.milkRoundId && (skip.reason === 'NOT_MILKED' || skip.reason === 'FORGOT')) {
          jobs.push(
            this.prisma.milkRoundSkip.upsert({
              where: { roundId_animalId: { roundId: round.milkRoundId, animalId: skip.animalId } },
              update: { reason: skip.reason === 'FORGOT' ? 'FORGOT' : 'NOT_MILKED' },
              create: {
                roundId: round.milkRoundId,
                animalId: skip.animalId,
                reason: skip.reason === 'FORGOT' ? 'FORGOT' : 'NOT_MILKED',
              },
            }),
          );
        }
        if (skip.reason === 'FORGOT') {
          jobs.push(
            ensureTask(this.prisma, {
              farmId: user.farmId,
              animalId: skip.animalId,
              type: 'MISSING_PRODUCTION',
              titleEn: 'Milk still not recorded',
              titleNp: 'दूध रेकर्ड बाँकी',
              dueAt: new Date(),
              priority: 'LOW',
              sourceRefType: 'recordingRound',
              sourceRefId: round.id,
            }),
          );
        }
        return jobs;
      }),
    );

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

    // Vaccination / treatment / weighing only need the roster — skip milk joins.
    if (mode !== 'MILKING') {
      const rows = await this.prisma.animal.findMany({
        where,
        select: {
          id: true,
          herdNumber: true,
          tag: true,
          name: true,
          species: true,
          shed: true,
          photoUrl: true,
          status: true,
          isPregnant: true,
        },
        orderBy: [{ shed: 'asc' }, { herdNumber: 'asc' }],
      });
      return rows.map((a) => ({ ...a, withholdUntil: null, usualLitres: null }));
    }

    // Roster + withhold flags only — one query. Nested production (7-day milk
    // rows per female) made remaining/today multi-second; the milking pad loads
    // rolling7Mean when an animal is opened.
    const rows = await this.prisma.animal.findMany({
      where,
      select: {
        id: true,
        herdNumber: true,
        tag: true,
        name: true,
        species: true,
        shed: true,
        photoUrl: true,
        status: true,
        isPregnant: true,
        health: {
          where: { milkWithholdUntil: { gte: now } },
          orderBy: { milkWithholdUntil: 'desc' },
          take: 1,
          select: { milkWithholdUntil: true },
        },
      },
      orderBy: [{ shed: 'asc' }, { herdNumber: 'asc' }],
    });
    return rows.map((a) => ({
      ...a,
      withholdUntil: a.health?.[0]?.milkWithholdUntil ?? null,
      usualLitres: null as number | null,
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
    const ranked = rows
      .map((a) => ({ animal: a, rank: rankAnimalMatch(raw, a) }))
      .filter((row): row is { animal: (typeof rows)[number]; rank: number } => row.rank != null)
      .sort((a, b) => a.rank - b.rank);
    if (ranked.length === 0) return [];
    // Exact B01 must win over digit-suffix ties like C01 — only the best rank tier counts.
    const best = ranked[0]!.rank;
    return ranked.filter((r) => r.rank === best).map((r) => r.animal);
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

type RoundRowCols = {
  roundId: string;
  mode: string;
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
};

type MilkingProgressRow = {
  animalId: string | null;
  herdNumber: string | null;
  tag: string | null;
  name: string | null;
  species: string | null;
  shed: string | null;
  photoUrl: string | null;
  animalStatus: string | null;
  isPregnant: boolean | null;
  withhold: Date | null;
  recorded: boolean | null;
  skipped: boolean | null;
};

function milkingAnimalDto(x: MilkingProgressRow): RoundRemainingDto['remaining'][number] {
  return {
    id: x.animalId as string,
    shortNo: x.herdNumber as string,
    tag: x.tag as string,
    name: x.name,
    species: x.species as RoundRemainingDto['remaining'][number]['species'],
    penName: x.shed,
    photoUrl: x.photoUrl,
    status: x.animalStatus as RoundRemainingDto['remaining'][number]['status'],
    isPregnant: Boolean(x.isPregnant),
    withholdActive: x.withhold != null,
    usualLitres: null,
  };
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
