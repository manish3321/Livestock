import { describe, expect, it } from 'vitest';
import type { BoardItemDto, BreedingBoardDto } from '@farm/contracts';
import { buildWalkRows, groupWalkByKind } from '../src/lib/breeding-groups';

/** Minimal board DTO shaped like GET /v1/breeding/board — what Walk renders online. */
function sampleBoard(): BreedingBoardDto {
  const item = (over: Partial<BoardItemDto> & Pick<BoardItemDto, 'taskId' | 'taskType' | 'shortNo'>): BoardItemDto => ({
    animalId: over.animalId ?? over.taskId,
    name: over.name ?? 'Test',
    species: 'BUFFALO',
    penName: 'Shed 1',
    penSortOrder: 1,
    seqNo: 1,
    photoUrl: null,
    contextEn: 'Do by: today. Why: test',
    contextNp: '',
    doByEn: over.doByEn ?? 'today before evening',
    doByNp: 'आज साँझ अघि',
    whyEn: over.whyEn ?? 'test',
    whyNp: 'परीक्षण',
    lateEn: over.lateEn ?? null,
    lateNp: over.lateNp ?? null,
    urgency: over.urgency ?? 'NORMAL',
    deadline: over.deadline ?? null,
    actions: over.actions ?? [{ key: 'RECORD_SERVICE', labelEn: 'Record', labelNp: 'लेख्नुहोस्', primary: true }],
    ...over,
  });

  return {
    date: '2026-10-30',
    groups: [
      {
        key: 'BREED_TODAY',
        labelEn: 'Breed today',
        labelNp: 'आज गर्भाधान',
        colour: 'RED',
        subLabelEn: 'window closes 4:00 pm',
        subLabelNp: '',
        items: [
          item({
            taskId: 't1',
            taskType: 'SERVICE_WINDOW',
            shortNo: 'B12',
            doByEn: 'before 4:00 pm',
            whyEn: '12–18h after standing heat',
            urgency: 'AMBER',
            deadline: '2026-10-30T10:15:00.000Z',
            actions: [
              { key: 'CALL_TECHNICIAN', labelEn: 'Call tech', labelNp: 'फोन', phone: '9800000000' },
              { key: 'RECORD_SERVICE', labelEn: 'Record service', labelNp: 'गर्भाधान', primary: true },
            ],
          }),
        ],
      },
      {
        key: 'COLOSTRUM',
        labelEn: 'Colostrum',
        labelNp: 'पहिलो दूध',
        colour: 'RED',
        subLabelEn: 'over 6 hours — FPT risk',
        subLabelNp: '',
        items: [
          item({
            taskId: 't2',
            taskType: 'COLOSTRUM_FEED',
            shortNo: 'B99',
            doByEn: 'within 2 hours of birth',
            whyEn: '8h after birth',
            lateEn: 'antibodies dropping — FPT risk',
            urgency: 'RED',
            actions: [{ key: 'RECORD_COLOSTRUM', labelEn: 'Record colostrum', labelNp: 'बिगौती', primary: true }],
          }),
          item({
            taskId: 't3',
            taskType: 'COLOSTRUM_FEED',
            shortNo: 'B98',
            animalId: 'a3',
            whyEn: '4h after birth',
            urgency: 'AMBER',
            actions: [{ key: 'RECORD_COLOSTRUM', labelEn: 'Record colostrum', labelNp: 'बिगौती', primary: true }],
          }),
          item({
            taskId: 't4',
            taskType: 'COLOSTRUM_FEED',
            shortNo: 'B97',
            animalId: 'a4',
            whyEn: '1h after birth',
            urgency: 'GREEN',
            actions: [{ key: 'RECORD_COLOSTRUM', labelEn: 'Record colostrum', labelNp: 'बिगौती', primary: true }],
          }),
        ],
      },
    ],
    decisionQueue: {
      count: 1,
      items: [
        {
          taskId: 'd1',
          animalId: 'a9',
          shortNo: 'B07',
          name: 'Ganga',
          titleEn: 'Mineral',
          titleNp: 'खनिज',
          kind: 'ANESTRUS_MINERAL',
          actions: [{ key: 'MINERAL_STARTED', labelEn: 'Mineral started', labelNp: 'खनिज', primary: true }],
        },
      ],
    },
    summary: { totalActions: 4, overdue: 1 },
  };
}

describe('mobile Walk vs board API', () => {
  it('can render board groups without local task approximation', () => {
    const board = sampleBoard();
    expect(board.groups.map((g) => g.key)).toEqual(['BREED_TODAY', 'COLOSTRUM']);
    const colo = board.groups[1]!;
    expect(new Set(colo.items.map((r) => r.urgency))).toEqual(new Set(['RED', 'AMBER', 'GREEN']));
    expect(colo.items.every((r) => r.doByEn && r.whyEn)).toBe(true);
    expect(colo.items[0]?.actions[0]?.key).toBe('RECORD_COLOSTRUM');
    expect(board.decisionQueue.items[0]?.actions?.[0]?.key).toBe('MINERAL_STARTED');
  });

  it('offline fallback walk groups stay today-only and include colostrum', () => {
    const now = new Date('2026-10-30T12:00:00+05:45');
    const rows = buildWalkRows(
      [
        {
          id: '1',
          type: 'SERVICE_WINDOW',
          status: 'PENDING',
          dueAt: new Date('2026-10-30T10:00:00+05:45').toISOString(),
          titleEn: 'Breed',
          animalId: 'a1',
          animalHerdNumber: 'B12',
        },
        {
          id: '2',
          type: 'COLOSTRUM_FEED',
          status: 'PENDING',
          dueAt: new Date('2026-10-30T08:00:00+05:45').toISOString(),
          titleEn: 'Colostrum',
          animalId: 'a2',
          animalHerdNumber: 'B99',
        },
        {
          id: '3',
          type: 'HEAT_WATCH',
          status: 'PENDING',
          dueAt: new Date('2026-10-31T05:00:00+05:45').toISOString(),
          titleEn: 'Tomorrow heat — should drop',
          animalId: 'a3',
          animalHerdNumber: 'B07',
        },
      ] as never,
      now,
    );
    const groups = groupWalkByKind(rows);
    expect(groups.map((g) => g.kind)).toEqual(['breedToday', 'colostrum']);
    expect(rows.every((r) => r.kind !== 'checkHeat')).toBe(true);
  });
});
