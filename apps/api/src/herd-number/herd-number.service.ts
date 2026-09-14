import { Injectable } from '@nestjs/common';
import {
  SPECIES_HERD_LETTER,
  TAG_SEQUENCE_BLOCK_SIZE,
  type Species,
  type TagSequenceBlockDto,
} from '@farm/contracts';
import type { Prisma } from '@prisma/client';
import { herdNumberOf } from '../animals/tag-rules';

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
    return herdNumberOf(species, seq.nextNumber - 1);
  }

  /**
   * Reserve a block of 100 numbers for one offline device and species.
   * Re-claiming while the current block still has numbers returns that block.
   */
  async claimBlock(
    tx: Prisma.TransactionClient,
    farmId: string,
    species: Species,
    deviceId: string,
  ): Promise<TagSequenceBlockDto> {
    const open = await tx.tagSequenceBlock.findFirst({
      where: { farmId, species, deviceId, exhaustedAt: null },
      orderBy: { issuedAt: 'desc' },
    });
    if (open && open.nextValue <= open.rangeEnd) {
      return toDto(open);
    }
    if (open) {
      await tx.tagSequenceBlock.update({
        where: { id: open.id },
        data: { exhaustedAt: open.exhaustedAt ?? new Date() },
      });
    }

    const range = await this.reserveRange(tx, farmId, species, TAG_SEQUENCE_BLOCK_SIZE);
    const created = await tx.tagSequenceBlock.create({
      data: {
        farmId,
        species,
        deviceId,
        rangeStart: range.from,
        rangeEnd: range.to,
        nextValue: range.from,
      },
    });
    return toDto(created);
  }

  async listBlocks(
    tx: Prisma.TransactionClient,
    farmId: string,
    deviceId: string,
  ): Promise<TagSequenceBlockDto[]> {
    const rows = await tx.tagSequenceBlock.findMany({
      where: { farmId, deviceId },
      orderBy: { issuedAt: 'desc' },
    });
    return rows.map(toDto);
  }

  /**
   * When an offline create used a number from this device's block, advance
   * nextValue so the same shortNo is never handed out twice.
   */
  async consumeIfOwned(
    tx: Prisma.TransactionClient,
    farmId: string,
    species: Species,
    deviceId: string,
    herdNumber: string,
  ): Promise<boolean> {
    const letter = SPECIES_HERD_LETTER[species];
    if (!herdNumber.toUpperCase().startsWith(letter)) return false;
    const n = Number(herdNumber.slice(letter.length));
    if (!Number.isInteger(n) || n < 1) return false;

    const block = await tx.tagSequenceBlock.findFirst({
      where: {
        farmId,
        species,
        deviceId,
        rangeStart: { lte: n },
        rangeEnd: { gte: n },
      },
      orderBy: { issuedAt: 'desc' },
    });
    if (!block) return false;
    if (n >= block.nextValue) {
      const nextValue = n + 1;
      await tx.tagSequenceBlock.update({
        where: { id: block.id },
        data: {
          nextValue,
          exhaustedAt: nextValue > block.rangeEnd ? new Date() : block.exhaustedAt,
        },
      });
    }
    return true;
  }

  private async reserveRange(
    tx: Prisma.TransactionClient,
    farmId: string,
    species: Species,
    size: number,
  ): Promise<{ from: number; to: number }> {
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
    return { from: to - size + 1, to };
  }
}

function toDto(row: {
  id: string;
  farmId: string;
  species: string;
  deviceId: string;
  rangeStart: number;
  rangeEnd: number;
  nextValue: number;
  issuedAt: Date;
  exhaustedAt: Date | null;
}): TagSequenceBlockDto {
  const species = row.species as Species;
  return {
    id: row.id,
    farmId: row.farmId,
    species: row.species,
    deviceId: row.deviceId,
    rangeStart: row.rangeStart,
    rangeEnd: row.rangeEnd,
    nextValue: row.nextValue,
    letter: SPECIES_HERD_LETTER[species],
    issuedAt: row.issuedAt.toISOString(),
    exhaustedAt: row.exhaustedAt?.toISOString() ?? null,
  };
}
