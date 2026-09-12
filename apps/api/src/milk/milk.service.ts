import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AnimalProfitDto,
  DeliveryCreate,
  EffectivePriceDto,
  MilkRecord,
  MilkRoundDto,
  MilkRoundStart,
  MilkSkip,
  PaymentStatementCreate,
  TankUpdate,
} from '@farm/contracts';
import { AuditService } from '../audit/audit.service';
import type { RequestUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';

const EXIT = ['SOLD', 'DEAD', 'CULLED'] as const;
const DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class MilkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async currentOrStart(user: RequestUser, input: MilkRoundStart): Promise<MilkRoundDto> {
    const roundDate = startOfDay(input.roundDate ?? new Date());
    const existing = await this.prisma.milkRound.findUnique({
      where: {
        farmId_roundDate_session: {
          farmId: user.farmId,
          roundDate,
          session: input.session,
        },
      },
    });
    if (existing) return this.getRound(user, existing.id);

    const created = await this.prisma.milkRound.create({
      data: {
        farmId: user.farmId,
        session: input.session,
        roundDate,
        startedById: user.id,
      },
    });
    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'milk.round.start',
      entityType: 'milkRound',
      entityId: created.id,
      metadata: { session: input.session },
    });
    return this.getRound(user, created.id);
  }

  async getRound(user: RequestUser, id: string): Promise<MilkRoundDto> {
    const round = await this.prisma.milkRound.findFirst({
      where: { id, farmId: user.farmId },
      include: {
        tank: true,
        skipped: true,
        entries: { include: { animal: true } },
      },
    });
    if (!round) {
      throw new NotFoundException({ code: 'ROUND_NOT_FOUND', message: 'Milking round not found' });
    }

    const herd = await this.prisma.animal.findMany({
      where: {
        farmId: user.farmId,
        deletedAt: null,
        status: { notIn: [...EXIT, 'DRY'] },
        gender: 'FEMALE',
      },
      include: {
        markers: { where: { removedAt: null } },
        health: {
          where: { milkWithholdUntil: { gte: new Date() } },
          orderBy: { milkWithholdUntil: 'desc' },
          take: 1,
        },
        production: {
          where: { type: 'MILK', entryDate: { gte: new Date(Date.now() - 7 * DAY) } },
          orderBy: { entryDate: 'desc' },
        },
      },
    });

    const recordedByAnimal = new Map(round.entries.filter((e) => e.animalId).map((e) => [e.animalId!, e]));
    const skippedByAnimal = new Map(round.skipped.map((s) => [s.animalId, s.reason]));

    const toRow = (a: (typeof herd)[number]) => {
      const entry = recordedByAnimal.get(a.id);
      const usual =
        a.production.length > 0
          ? a.production.reduce((s, p) => s + Number(p.quantity), 0) / a.production.length
          : null;
      const withhold = a.health[0]?.milkWithholdUntil ?? null;
      return {
        id: a.id,
        herdNumber: a.herdNumber,
        tag: a.tag,
        name: a.name,
        species: a.species,
        shed: a.shed,
        photoUrl: a.photoUrl,
        status: a.status,
        isPregnant: a.isPregnant,
        usualLitres: usual,
        milkWithholdUntil: withhold?.toISOString() ?? null,
        withholdActive: withhold != null,
        recordedLitres: entry ? Number(entry.quantity) : null,
        destination: entry?.destination ?? null,
        entryId: entry?.id ?? null,
        skippedReason: skippedByAnimal.get(a.id) ?? null,
        markers: a.markers.map((m) => ({ color: m.color, meaning: m.meaning })),
      };
    };

    const remaining = herd
      .filter((a) => !recordedByAnimal.has(a.id) && skippedByAnimal.get(a.id) !== 'NOT_MILKED')
      .map(toRow)
      .sort(byShedThenNumber);
    const recordedAnimals = herd.filter((a) => recordedByAnimal.has(a.id)).map(toRow).sort(byShedThenNumber);

    const expected = round.entries
      .filter((e) => e.destination === 'SOLD')
      .reduce((s, e) => s + Number(e.quantity), 0);

    return {
      id: round.id,
      session: round.session,
      roundDate: round.roundDate.toISOString(),
      status: round.status,
      expected,
      recorded: recordedAnimals.length,
      remaining,
      recordedAnimals,
      tank: round.tank
        ? {
            id: round.tank.id,
            expectedLitres: Number(round.tank.expectedLitres),
            actualLitres: round.tank.actualLitres != null ? Number(round.tank.actualLitres) : null,
            variancePercent:
              round.tank.actualLitres != null && Number(round.tank.expectedLitres) > 0
                ? ((Number(round.tank.actualLitres) - Number(round.tank.expectedLitres)) /
                    Number(round.tank.expectedLitres)) *
                  100
                : null,
            temperatureC: round.tank.temperatureC != null ? Number(round.tank.temperatureC) : null,
            compositeFat: round.tank.compositeFat != null ? Number(round.tank.compositeFat) : null,
            compositeSnf: round.tank.compositeSnf != null ? Number(round.tank.compositeSnf) : null,
            cobResult: round.tank.cobResult,
          }
        : null,
    };
  }

  async record(user: RequestUser, roundId: string, input: MilkRecord, requestId?: string) {
    const round = await this.requireOpenRound(user.farmId, roundId);
    const animal = await this.prisma.animal.findFirst({
      where: { id: input.animalId, farmId: user.farmId, deletedAt: null },
      include: {
        health: {
          where: { milkWithholdUntil: { gte: new Date() } },
          orderBy: { milkWithholdUntil: 'desc' },
          take: 1,
        },
        production: {
          where: { type: 'MILK', entryDate: { gte: new Date(Date.now() - 7 * DAY) } },
        },
      },
    });
    if (!animal) {
      throw new NotFoundException({ code: 'ANIMAL_NOT_FOUND', message: 'Animal not found' });
    }
    if (animal.status === 'DRY') {
      throw new BadRequestException({
        code: 'ANIMAL_DRY',
        message: 'She is marked dry. Has she calved?',
      });
    }
    if ((EXIT as readonly string[]).includes(animal.status)) {
      throw new BadRequestException({
        code: 'ANIMAL_GONE',
        message: 'This animal has left the herd',
      });
    }

    const withhold = animal.health[0]?.milkWithholdUntil;
    if (withhold && input.destination === 'SOLD') {
      throw new BadRequestException({
        code: 'MILK_WITHHOLD',
        message: `Milk must not be sold until ${withhold.toISOString().slice(0, 10)}. Discard, feed a calf, or keep for the house.`,
        withholdUntil: withhold.toISOString(),
      });
    }

    const usual =
      animal.production.length > 0
        ? animal.production.reduce((s, p) => s + Number(p.quantity), 0) / animal.production.length
        : null;
    if (usual && !input.confirmOutOfRange && (input.quantity > usual * 2.5 || input.quantity < usual * 0.3)) {
      throw new ConflictException({
        code: 'YIELD_OUT_OF_RANGE',
        message: `Usual is ${usual.toFixed(1)} L. Confirm if ${input.quantity} is right.`,
        usualLitres: usual,
      });
    }

    const existing = await this.prisma.productionEntry.findFirst({
      where: {
        farmId: user.farmId,
        animalId: animal.id,
        type: 'MILK',
        session: round.session,
        entryDate: { gte: round.roundDate, lt: new Date(round.roundDate.getTime() + DAY) },
      },
    });

    const destination = withhold ? (input.destination === 'SOLD' ? 'DISCARDED' : input.destination) : input.destination;

    if (existing) {
      await this.prisma.productionRevision.create({
        data: {
          farmId: user.farmId,
          entryId: existing.id,
          previousQuantity: existing.quantity,
          newQuantity: input.quantity,
          changedById: user.id,
        },
      });
      await this.prisma.productionEntry.update({
        where: { id: existing.id },
        data: {
          quantity: input.quantity,
          destination,
          milkRoundId: round.id,
          milkerName: user.email,
          udderFlag: input.udderFlag ?? existing.udderFlag,
          collectionMethod: input.collectionMethod,
        },
      });
    } else {
      await this.prisma.productionEntry.create({
        data: {
          farmId: user.farmId,
          type: 'MILK',
          entryDate: round.roundDate,
          quantity: input.quantity,
          unit: 'L',
          animalId: animal.id,
          milkRoundId: round.id,
          session: round.session,
          destination,
          milkerName: user.email,
          collectionMethod: input.collectionMethod,
          udderFlag: input.udderFlag ?? false,
        },
      });
    }

    if (usual && input.quantity < usual * 0.8) {
      await this.prisma.task.create({
        data: {
          farmId: user.farmId,
          animalId: animal.id,
          type: 'YIELD_DROP',
          titleEn: `${animal.herdNumber ?? animal.tag} dropped below 80% of her own average`,
          titleNp: `${animal.herdNumber ?? animal.tag} आफ्नो औसतको ८०% भन्दा घट्यो`,
          dueAt: new Date(),
          priority: 'HIGH',
          source: 'AUTO',
          sourceRefType: 'milkRound',
          sourceRefId: round.id,
        },
      }).catch(() => undefined);
    }

    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: existing ? 'milk.record.correct' : 'milk.record',
      entityType: 'productionEntry',
      entityId: animal.id,
      metadata: { quantity: input.quantity, destination },
      requestId,
    });

    return this.getRound(user, round.id);
  }

  async skip(user: RequestUser, roundId: string, input: MilkSkip): Promise<MilkRoundDto> {
    const round = await this.requireOpenRound(user.farmId, roundId);
    await this.prisma.milkRoundSkip.upsert({
      where: { roundId_animalId: { roundId: round.id, animalId: input.animalId } },
      update: { reason: input.reason },
      create: { roundId: round.id, animalId: input.animalId, reason: input.reason },
    });
    if (input.reason === 'FORGOT') {
      await this.prisma.task.create({
        data: {
          farmId: user.farmId,
          animalId: input.animalId,
          type: 'MISSING_PRODUCTION',
          titleEn: 'Milk still not recorded',
          titleNp: 'दूध रेकर्ड बाँकी',
          dueAt: new Date(),
          priority: 'LOW',
          source: 'AUTO',
          sourceRefType: 'milkRound',
          sourceRefId: round.id,
        },
      }).catch(() => undefined);
    }
    return this.getRound(user, round.id);
  }

  async finish(user: RequestUser, roundId: string): Promise<MilkRoundDto> {
    const round = await this.requireOpenRound(user.farmId, roundId);
    const entries = await this.prisma.productionEntry.findMany({
      where: { milkRoundId: round.id, destination: 'SOLD' },
    });
    const expected = entries.reduce((s, e) => s + Number(e.quantity), 0);
    await this.prisma.$transaction([
      this.prisma.milkTank.upsert({
        where: { roundId: round.id },
        update: { expectedLitres: expected },
        create: {
          farmId: user.farmId,
          roundId: round.id,
          expectedLitres: expected,
        },
      }),
      this.prisma.milkRound.update({
        where: { id: round.id },
        data: { status: 'FINISHED', finishedAt: new Date() },
      }),
    ]);
    return this.getRound(user, round.id);
  }

  async updateTank(user: RequestUser, roundId: string, input: TankUpdate): Promise<MilkRoundDto> {
    const round = await this.prisma.milkRound.findFirst({
      where: { id: roundId, farmId: user.farmId },
      include: { tank: true },
    });
    if (!round?.tank) {
      throw new NotFoundException({ code: 'TANK_NOT_FOUND', message: 'Finish the round first' });
    }
    await this.prisma.milkTank.update({
      where: { id: round.tank.id },
      data: {
        actualLitres: input.actualLitres,
        temperatureC: input.temperatureC,
        compositeFat: input.compositeFat,
        compositeSnf: input.compositeSnf,
        cobResult: input.cobResult,
      },
    });
    return this.getRound(user, round.id);
  }

  async addDelivery(user: RequestUser, roundId: string, input: DeliveryCreate) {
    const round = await this.prisma.milkRound.findFirst({
      where: { id: roundId, farmId: user.farmId },
      include: { tank: true },
    });
    if (!round?.tank) {
      throw new NotFoundException({ code: 'TANK_NOT_FOUND', message: 'Finish the round first' });
    }
    return this.prisma.milkDelivery.upsert({
      where: { tankId: round.tank.id },
      update: input,
      create: { farmId: user.farmId, tankId: round.tank.id, ...input },
    });
  }

  async recordPayment(user: RequestUser, input: PaymentStatementCreate) {
    const net = input.netPaid;
    const effective = input.litres > 0 ? net / input.litres : 0;
    return this.prisma.paymentStatement.create({
      data: {
        farmId: user.farmId,
        ...input,
        effectivePrice: effective,
      },
    });
  }

  async effectivePrice(user: RequestUser): Promise<EffectivePriceDto> {
    const latest = await this.prisma.paymentStatement.findFirst({
      where: { farmId: user.farmId },
      orderBy: { periodEnd: 'desc' },
    });
    if (!latest) {
      return { litres: 0, netPaid: 0, effectivePrice: 0, headlineRate: null, periodEnd: null };
    }
    return {
      litres: Number(latest.litres),
      netPaid: Number(latest.netPaid),
      effectivePrice: Number(latest.effectivePrice),
      headlineRate: Number(latest.baseRate),
      periodEnd: latest.periodEnd.toISOString(),
    };
  }

  async profitRanking(user: RequestUser): Promise<AnimalProfitDto[]> {
    const price = await this.effectivePrice(user);
    const rate = price.effectivePrice > 0 ? price.effectivePrice : 80;
    const from = new Date(Date.now() - 30 * DAY);
    const animals = await this.prisma.animal.findMany({
      where: {
        farmId: user.farmId,
        deletedAt: null,
        gender: 'FEMALE',
        species: { in: ['BUFFALO', 'COW', 'GOAT'] },
        status: { notIn: [...EXIT] },
      },
      include: {
        production: { where: { type: 'MILK', entryDate: { gte: from } } },
        feedLogs: { where: { occurredAt: { gte: from } } },
        health: { where: { performedAt: { gte: from } } },
      },
    });
    const labourShare = animals.length ? 50 : 0;
    const rows = animals.map((a) => {
      const litres = a.production.reduce((s, p) => s + Number(p.quantity), 0);
      const feed = a.feedLogs.reduce((s, f) => s + Number(f.totalCost ?? 0), 0);
      const health = a.health.reduce((s, h) => s + Number(h.cost ?? 0), 0);
      const labour = labourShare;
      const revenue = litres * rate;
      const profit = revenue - feed - health - labour;
      return {
        animalId: a.id,
        herdNumber: a.herdNumber,
        tag: a.tag,
        name: a.name,
        species: a.species,
        litres30d: litres,
        revenue,
        feedCost: feed,
        healthCost: health,
        labourCost: labour,
        profit,
        feedCostPerLitre: litres > 0 ? feed / litres : null,
        bottomDecile: false,
      };
    });
    rows.sort((a, b) => b.profit - a.profit);
    const cut = Math.max(1, Math.ceil(rows.length * 0.1));
    for (let i = rows.length - cut; i < rows.length; i++) {
      const row = rows[i];
      if (row) row.bottomDecile = true;
    }
    return rows;
  }

  async dailySheet(user: RequestUser) {
    const now = new Date();
    const animals = await this.prisma.animal.findMany({
      where: { farmId: user.farmId, deletedAt: null, status: { notIn: [...EXIT] } },
      include: {
        markers: { where: { removedAt: null } },
        health: {
          where: {
            OR: [
              { milkWithholdUntil: { gte: now } },
              { nextDueAt: { gte: now, lte: new Date(now.getTime() + DAY) } },
            ],
          },
        },
      },
      orderBy: [{ shed: 'asc' }, { herdNumber: 'asc' }],
    });
    return animals.map((a) => ({
      herdNumber: a.herdNumber,
      name: a.name,
      shed: a.shed,
      milk: a.status !== 'DRY' && a.gender === 'FEMALE',
      withhold: a.health.some((h) => h.milkWithholdUntil && h.milkWithholdUntil >= now),
      dry: a.status === 'DRY',
      treatment: a.health.find((h) => h.type === 'TREATMENT')?.title ?? null,
      band: a.markers[0] ? `${a.markers[0].color}:${a.markers[0].meaning}` : null,
    }));
  }

  async lookup(user: RequestUser, q: string) {
    const needle = q.trim().toUpperCase().replace(/^0+/, '');
    if (!needle) return [];
    const animals = await this.prisma.animal.findMany({
      where: {
        farmId: user.farmId,
        deletedAt: null,
        OR: [
          { herdNumber: { equals: q.trim().toUpperCase(), mode: 'insensitive' } },
          { herdNumber: { endsWith: needle, mode: 'insensitive' } },
          { tag: { contains: needle, mode: 'insensitive' } },
          { name: { contains: q.trim(), mode: 'insensitive' } },
        ],
      },
      take: 8,
      orderBy: { herdNumber: 'asc' },
    });
    return animals.map((a) => ({
      id: a.id,
      herdNumber: a.herdNumber,
      tag: a.tag,
      name: a.name,
      species: a.species,
      shed: a.shed,
      photoUrl: a.photoUrl,
      status: a.status,
    }));
  }

  private async requireOpenRound(farmId: string, id: string) {
    const round = await this.prisma.milkRound.findFirst({ where: { id, farmId } });
    if (!round) {
      throw new NotFoundException({ code: 'ROUND_NOT_FOUND', message: 'Milking round not found' });
    }
    if (round.status !== 'OPEN') {
      throw new BadRequestException({ code: 'ROUND_CLOSED', message: 'This round is finished' });
    }
    return round;
  }
}

function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function byShedThenNumber(
  a: { shed: string | null; herdNumber: string | null },
  b: { shed: string | null; herdNumber: string | null },
): number {
  return (a.shed ?? '').localeCompare(b.shed ?? '') || (a.herdNumber ?? '').localeCompare(b.herdNumber ?? '');
}
