import { Injectable, NotFoundException } from '@nestjs/common';
import type { BreedingWatchDto, ReproStage, ReproTimelineDto, Species } from '@farm/contracts';
import type { RequestUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { SpeciesConfigService } from '../species-config/species-config.service';
import { buildBreedingWatch, buildReproTimeline, type WatchAnimal } from './breeding-watch';
import { wholeDays } from './repro-stage';

@Injectable()
export class BreedingWatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly species: SpeciesConfigService,
  ) {}

  async getWatch(user: RequestUser, stage?: ReproStage, now = new Date()): Promise<BreedingWatchDto> {
    const [animals, configs] = await Promise.all([
      this.loadAnimals(user.farmId, now, stage),
      this.species.all(),
    ]);
    const configBySpecies = new Map(configs.map((row) => [row.species, row]));
    return buildBreedingWatch({ animals, configBySpecies, now, stage });
  }

  async getTimeline(user: RequestUser, animalId: string, now = new Date()): Promise<ReproTimelineDto> {
    const rows = await this.loadAnimals(user.farmId, now, undefined, animalId);
    const animal = rows.find((row) => row.id === animalId);
    if (!animal) {
      throw new NotFoundException({ code: 'ANIMAL_NOT_FOUND', message: 'Animal not found' });
    }
    const cfg = await this.species.forSpecies(animal.species as Species);
    const tasks = await this.prisma.task.findMany({
      where: {
        farmId: user.farmId,
        animalId,
        deletedAt: null,
        status: { in: ['PENDING', 'SNOOZED'] },
      },
      orderBy: { dueAt: 'asc' },
      take: 3,
      select: { titleEn: true, titleNp: true, dueAt: true, type: true },
    });
    return buildReproTimeline({ animal, cfg, tasks, now });
  }

  private async loadAnimals(
    farmId: string,
    now: Date,
    stage?: ReproStage,
    animalId?: string,
  ): Promise<WatchAnimal[]> {
    const animals = await this.prisma.animal.findMany({
      where: {
        farmId,
        deletedAt: null,
        gender: 'FEMALE',
        species: { in: ['BUFFALO', 'COW'] },
        ...(stage ? { reproStage: stage } : {}),
        ...(animalId ? { id: animalId } : {}),
      },
      include: {
        pen: { select: { name: true, sortOrder: true } },
        heatEvents: { orderBy: { observedAt: 'desc' }, take: 1 },
        breedingServices: { orderBy: { serviceDate: 'desc' }, take: 1 },
        syncEnrollments: {
          where: { status: 'ACTIVE' },
          include: { protocol: true },
          take: 1,
        },
      },
    });

    return animals.map((row) => {
      const heat = row.heatEvents[0] ?? null;
      const service = row.breedingServices[0] ?? null;
      const enrollment = row.syncEnrollments[0] ?? null;
      const protocolDay =
        enrollment != null ? Math.max(0, wholeDays(enrollment.startDate, now)) : null;
      const heatInCycle = heat && (!row.lactationStartDate || heat.observedAt >= row.lactationStartDate);
      const serviceInCycle =
        service && (!row.lactationStartDate || service.serviceDate >= row.lactationStartDate);
      return {
        id: row.id,
        herdNumber: row.herdNumber,
        tag: row.tag,
        name: row.name,
        species: row.species,
        stage: row.reproStage,
        photoUrl: row.photoUrl,
        penName: row.pen?.name ?? null,
        penSortOrder: row.pen?.sortOrder ?? null,
        seqNo: row.seqNo,
        shed: row.shed,
        lactationStart: row.lactationStartDate,
        dateOfBirth: row.dateOfBirth,
        expectedCalvingDate: row.expectedCalvingDate,
        lastHeatAt: heat && heatInCycle ? heat.observedAt : null,
        lastServiceAt: service && serviceInCycle ? service.serviceDate : null,
        pregnancyConfirmedAt: row.pregnancyConfirmedDate,
        protocolDay,
        protocolTotalDays: enrollment?.protocol.totalDays ?? null,
        protocolNameEn: enrollment?.protocol.nameEn ?? null,
        protocolNameNp: enrollment?.protocol.nameNp ?? null,
      };
    });
  }
}
