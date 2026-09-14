import './setup-env';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { TAG_SEQUENCE_BLOCK_SIZE } from '@farm/contracts';
import { HerdNumberService } from '../src/herd-number/herd-number.service';
import { FakePrisma } from './fakes';
import { herdNumberOf, nextPrintableTag, tagFromHerdSeq } from '../src/animals/tag-rules';

describe('HerdNumberService.claimBlock', () => {
  it('hands two devices disjoint blocks of 100', async () => {
    const prisma = new FakePrisma();
    const numbers = new HerdNumberService();
    const farmId = randomUUID();
    const a = await numbers.claimBlock(prisma as never, farmId, 'BUFFALO', 'phone-aaaa');
    const b = await numbers.claimBlock(prisma as never, farmId, 'BUFFALO', 'phone-bbbb');

    expect(a.rangeEnd - a.rangeStart + 1).toBe(TAG_SEQUENCE_BLOCK_SIZE);
    expect(b.rangeStart).toBe(a.rangeEnd + 1);
    expect(b.rangeEnd).toBe(a.rangeEnd + TAG_SEQUENCE_BLOCK_SIZE);
    expect(a.nextValue).toBe(a.rangeStart);
  });

  it('returns the same open block instead of allocating another', async () => {
    const prisma = new FakePrisma();
    const numbers = new HerdNumberService();
    const farmId = randomUUID();
    const first = await numbers.claimBlock(prisma as never, farmId, 'COW', 'phone-aaaa');
    const again = await numbers.claimBlock(prisma as never, farmId, 'COW', 'phone-aaaa');
    expect(again.id).toBe(first.id);
    expect(prisma.tagBlocks).toHaveLength(1);
  });

  it('consumes a number from the owning device block', async () => {
    const prisma = new FakePrisma();
    const numbers = new HerdNumberService();
    const farmId = randomUUID();
    const block = await numbers.claimBlock(prisma as never, farmId, 'BUFFALO', 'phone-aaaa');
    const shortNo = herdNumberOf('BUFFALO', block.rangeStart);
    const owned = await numbers.consumeIfOwned(
      prisma as never,
      farmId,
      'BUFFALO',
      'phone-aaaa',
      shortNo,
    );
    expect(owned).toBe(true);
    expect(prisma.tagBlocks[0]?.nextValue).toBe(block.rangeStart + 1);
    const other = await numbers.consumeIfOwned(
      prisma as never,
      farmId,
      'BUFFALO',
      'phone-bbbb',
      shortNo,
    );
    expect(other).toBe(false);
  });
});

describe('tag-rules', () => {
  it('advances BUF001 to BUF002 and builds a tag from the herd sequence', () => {
    expect(nextPrintableTag('BUF001')).toBe('BUF002');
    expect(tagFromHerdSeq('BUFFALO', 12)).toBe('BUF012');
    expect(herdNumberOf('COW', 7)).toBe('C07');
  });
});
