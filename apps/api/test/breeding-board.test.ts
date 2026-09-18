import { describe, expect, it } from 'vitest';
import { boardActions, buildBreedingBoard, compareWalkOrder, type BoardItemDto } from '../src/breeding/breeding-board';

function item(overrides: Partial<BoardItemDto> & Pick<BoardItemDto, 'taskId' | 'taskType' | 'shortNo'>): BoardItemDto {
  return {
    animalId: overrides.animalId ?? overrides.taskId,
    name: overrides.name ?? 'काली',
    species: 'BUFFALO',
    penName: overrides.penName ?? 'Shed 1',
    penSortOrder: overrides.penSortOrder ?? 1,
    seqNo: overrides.seqNo ?? 1,
    photoUrl: null,
    contextEn: 'due today, cycle day 21',
    contextNp: 'आज आउने सम्भावना, चक्र दिन 21',
    deadline: null,
    actions: [],
    ...overrides,
  };
}

describe('boardActions', () => {
  it('makes a dry-off task ask whether she is still pregnant', () => {
    const actions = boardActions('DRY_OFF', {} as never, { animalId: 'a1', taskId: 't1' });
    expect(actions.map((a) => a.key)).toEqual(['DRIED_OFF', 'EMPTY_AT_DRY_OFF']);
    expect(actions.every((a) => a.labelEn && a.labelNp)).toBe(true);
  });
});

describe('buildBreedingBoard', () => {
  it('returns groups in the fixed order and omits empty groups', () => {
    const board = buildBreedingBoard({
      date: '2026-03-17',
      now: new Date('2026-03-17T00:00:00+05:45'),
      role: 'WORKER',
      animals: [
        { id: 'a1', herdNumber: 'B12', tag: 'B12', name: 'काली', species: 'BUFFALO', shed: 'Shed 1', photoUrl: null, penName: 'Shed 1', penSortOrder: 1, seqNo: 12 },
        { id: 'a2', herdNumber: 'B07', tag: 'B07', name: 'गंगा', species: 'BUFFALO', shed: 'Shed 2', photoUrl: null, penName: 'Shed 2', penSortOrder: 2, seqNo: 7 },
        { id: 'a3', herdNumber: 'C02', tag: 'C02', name: 'जर्सी', species: 'COW', shed: 'Shed 3', photoUrl: null, penName: 'Shed 3', penSortOrder: 3, seqNo: 2 },
      ],
      tasks: [
        { id: 't1', type: 'SERVICE_WINDOW', titleEn: 'Breed B12', titleNp: '', dueAt: new Date('2026-03-17T16:00:00+05:45'), priority: 'HIGH', animalId: 'a1', metadata: { time: '5:20 am', deadline: '4:00 pm' } },
        { id: 't2', type: 'HEAT_WATCH', titleEn: 'Watch B07', titleNp: '', dueAt: new Date('2026-03-17T05:00:00+05:45'), priority: 'NORMAL', animalId: 'a2', metadata: { n: 21 } },
        { id: 't3', type: 'PREGNANCY_CHECK', titleEn: 'PD C02', titleNp: '', dueAt: new Date('2026-03-17T10:00:00+05:45'), priority: 'HIGH', animalId: 'a3', metadata: { n: 47 } },
        { id: 't4', type: 'REPEAT_BREEDER', titleEn: 'Repeat', titleNp: 'दोहोरिने', dueAt: new Date('2026-03-17T08:00:00+05:45'), priority: 'HIGH', animalId: 'a1' },
      ],
    });
    expect(board.groups.map((g) => g.key)).toEqual(['BREED_TODAY', 'CHECK_HEAT', 'PREGNANCY_CHECK']);
    expect(board.groups.every((g) => g.items.length > 0)).toBe(true);
    expect(board.groups[0]?.items[0]?.contextEn).toContain('breed before');
    expect(board.groups[0]?.items[0]?.contextNp).toContain('गर्भाधान');
    expect(board.decisionQueue.count).toBe(1);
    expect(board.decisionQueue.items).toEqual([]);
    expect(board.summary.totalActions).toBe(3);
  });

  it('gives MANAGER populated decision items', () => {
    const board = buildBreedingBoard({
      date: '2026-03-17',
      now: new Date('2026-03-17T00:00:00+05:45'),
      role: 'MANAGER',
      animals: [{ id: 'a1', herdNumber: 'B12', tag: 'B12', name: 'काली', species: 'BUFFALO', shed: 'Shed 1', photoUrl: null, seqNo: 1 }],
      tasks: [{ id: 't4', type: 'ANESTRUS_MINERAL', titleEn: 'Mineral', titleNp: 'खनिज', dueAt: new Date(), priority: 'NORMAL', animalId: 'a1' }],
    });
    expect(board.decisionQueue.items).toHaveLength(1);
    expect(board.decisionQueue.items[0]?.kind).toBe('ANESTRUS_MINERAL');
  });

  it('sorts by pen.sortOrder then seqNo, never by name', () => {
    const rows: BoardItemDto[] = [
      item({ taskId: '1', taskType: 'HEAT_WATCH', shortNo: 'B19', penSortOrder: 2, seqNo: 1, name: 'आशा' }),
      item({ taskId: '2', taskType: 'HEAT_WATCH', shortNo: 'B07', penSortOrder: 1, seqNo: 19, name: 'गंगा' }),
      item({ taskId: '3', taskType: 'HEAT_WATCH', shortNo: 'B03', penSortOrder: 1, seqNo: 3, name: 'मन्सरा' }),
    ];
    const sorted = [...rows].sort(compareWalkOrder);
    expect(sorted.map((r) => r.shortNo)).toEqual(['B03', 'B07', 'B19']);
  });

  it('collapses multiple calving watches to one animal', () => {
    const board = buildBreedingBoard({
      date: '2026-03-17',
      now: new Date('2026-03-17T00:00:00+05:45'),
      role: 'WORKER',
      animals: [{ id: 'a1', herdNumber: 'B12', tag: 'B12', name: 'काली', species: 'BUFFALO', shed: 'Shed 1', photoUrl: null, penName: 'Shed 1', penSortOrder: 1, seqNo: 12 }],
      tasks: [
        { id: 't1', type: 'CALVING_WATCH', titleEn: '7d', titleNp: '', dueAt: new Date('2026-03-10T05:00:00+05:45'), priority: 'CRITICAL', animalId: 'a1', metadata: { n: 7 } },
        { id: 't2', type: 'CALVING_WATCH', titleEn: 'today', titleNp: '', dueAt: new Date('2026-03-17T05:00:00+05:45'), priority: 'CRITICAL', animalId: 'a1', metadata: { n: 0 } },
      ],
    });
    expect(board.groups).toHaveLength(1);
    expect(board.groups[0]?.items).toHaveLength(1);
    expect(board.groups[0]?.items[0]?.taskId).toBe('t2');
    expect(board.decisionQueue.items).toEqual([]);
  });

  it('manager decisions include action verbs', () => {
    const board = buildBreedingBoard({
      date: '2026-03-17',
      now: new Date('2026-03-17T00:00:00+05:45'),
      role: 'MANAGER',
      animals: [{ id: 'a1', herdNumber: 'B12', tag: 'B12', name: 'काली', species: 'BUFFALO', shed: 'Shed 1', photoUrl: null, seqNo: 1 }],
      tasks: [{ id: 't4', type: 'ANESTRUS_MINERAL', titleEn: 'Mineral', titleNp: 'खनिज', dueAt: new Date(), priority: 'NORMAL', animalId: 'a1' }],
    });
    expect(board.decisionQueue.items[0]?.actions?.some((a) => a.key === 'MINERAL_STARTED')).toBe(true);
    expect(board.decisionQueue.items[0]?.actions?.some((a) => a.key === 'START_PROTOCOL')).toBe(true);
  });
});
