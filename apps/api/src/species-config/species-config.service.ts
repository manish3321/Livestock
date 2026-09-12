import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Species, SpeciesConfigDto, SpeciesConfigUpdate } from '@farm/contracts';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Serves the reproductive constants that used to be hardcoded.
 *
 * Every one of these differs between buffalo and cattle, and the widely quoted
 * 305-day lactation is a Holstein number that does not describe a Nepali herd.
 * Code asks this service rather than embedding a figure, so correcting a
 * constant is a data change instead of a release.
 *
 * Cached in memory because breeding maths reads it on nearly every request and
 * the row set is four rows that change approximately never.
 */
@Injectable()
export class SpeciesConfigService {
  private readonly logger = new Logger(SpeciesConfigService.name);
  private cache: Map<Species, SpeciesConfigDto> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async all(): Promise<SpeciesConfigDto[]> {
    const cache = await this.load();
    return [...cache.values()];
  }

  /**
   * Constants for one species. Throws rather than falling back to a default:
   * a silent wrong gestation length would quietly mis-date every calving on
   * the farm, which is far worse than a loud failure.
   */
  async forSpecies(species: Species): Promise<SpeciesConfigDto> {
    const cache = await this.load();
    const config = cache.get(species);
    if (!config) {
      throw new NotFoundException({
        code: 'SPECIES_CONFIG_MISSING',
        message: `No reproductive constants configured for species ${species}. Run the seed.`,
      });
    }
    return config;
  }

  async update(species: Species, input: SpeciesConfigUpdate): Promise<SpeciesConfigDto> {
    await this.forSpecies(species);
    const row = await this.prisma.speciesConfig.update({
      where: { species },
      data: input,
    });
    this.invalidate();
    return toDto(row);
  }

  /** Drops the cache; call after any write to SpeciesConfig. */
  invalidate(): void {
    this.cache = null;
  }

  private async load(): Promise<Map<Species, SpeciesConfigDto>> {
    if (this.cache) return this.cache;
    const rows = await this.prisma.speciesConfig.findMany();
    if (rows.length === 0) {
      this.logger.error('SpeciesConfig table is empty — breeding calculations will fail');
    }
    const cache = new Map<Species, SpeciesConfigDto>();
    for (const row of rows) {
      cache.set(row.species as Species, toDto(row));
    }
    this.cache = cache;
    return cache;
  }
}

type SpeciesConfigRow = {
  species: string;
  gestationDays: number;
  lactationDays: number;
  voluntaryWaitingDays: number;
  estrusCycleDays: number;
  ageFirstServiceMonths: number;
  pregnancyCheckEarliestDays: number;
  targetCalvingIntervalDays: number;
  dryOffDaysBeforeCalving: number;
  minWeightFirstServiceKg: number;
};

function toDto(row: SpeciesConfigRow): SpeciesConfigDto {
  return {
    species: row.species as Species,
    gestationDays: row.gestationDays,
    lactationDays: row.lactationDays,
    voluntaryWaitingDays: row.voluntaryWaitingDays,
    estrusCycleDays: row.estrusCycleDays,
    ageFirstServiceMonths: row.ageFirstServiceMonths,
    pregnancyCheckEarliestDays: row.pregnancyCheckEarliestDays,
    targetCalvingIntervalDays: row.targetCalvingIntervalDays,
    dryOffDaysBeforeCalving: row.dryOffDaysBeforeCalving,
    minWeightFirstServiceKg: row.minWeightFirstServiceKg,
  };
}
