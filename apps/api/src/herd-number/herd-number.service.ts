import { Injectable } from '@nestjs/common';
import { SPECIES_HERD_LETTER, type Species } from '@farm/contracts';
import type { Prisma } from '@prisma/client';

/**
 * Short numbers are the identifier a worker holds walking to the shed.
 * B42 is issued once and never again, including after sale or death.
 */
@Injectable()
export class HerdNumberService {
  async issue(
    tx: Prisma.TransactionClient,
    farmId: string,
    species: Species,
  ): Promise<string> {
    const letter = SPECIES_HERD_LETTER[species];
    const seq = await tx.herdNumberSequence.upsert({
      where: { farmId_species: { farmId, species } },
      update: { nextNumber: { increment: 1 } },
      create: {
        farmId,
        species,
        nextNumber: 2,
        reservedThrough: 1,
      },
    });
    const n = seq.nextNumber - 1;
    return `${letter}${String(n).padStart(2, '0')}`;
  }

  /** Reserve a block of 20 numbers for an offline phone. Never reused. */
  async reserveBlock(
    tx: Prisma.TransactionClient,
    farmId: string,
    species: Species,
    size = 20,
  ): Promise<{ from: number; to: number; letter: string }> {
    const letter = SPECIES_HERD_LETTER[species];
    const seq = await tx.herdNumberSequence.upsert({
      where: { farmId_species: { farmId, species } },
      update: { reservedThrough: { increment: size }, nextNumber: { increment: size } },
      create: {
        farmId,
        species,
        nextNumber: size + 1,
        reservedThrough: size,
      },
    });
    const to = seq.reservedThrough;
    return { from: to - size + 1, to, letter };
  }
}
