import type {
  BoardDecisionDto,
  BoardGroupDto,
  BoardGroupKey,
  BoardItemDto,
  BreedingBoardDto,
  Role,
  TaskPriority,
  TaskType,
} from '@farm/contracts';

export type { BoardItemDto, BoardGroupDto, BreedingBoardDto } from '@farm/contracts';

export const BOARD_GROUP_ORDER: BoardGroupKey[] = [
  'BREED_TODAY',
  'CHECK_HEAT',
  'CALVING_WATCH',
  'PREGNANCY_CHECK',
  'INJECTION',
  'DRY_OFF',
  'POSTPARTUM_CHECK',
];

export const BOARD_TASK_GROUP: Partial<Record<TaskType, BoardGroupKey>> = {
  SERVICE_WINDOW: 'BREED_TODAY',
  SYNC_AI: 'BREED_TODAY',
  HEAT_WATCH: 'CHECK_HEAT',
  SILENT_HEAT_CHECK: 'CHECK_HEAT',
  CALVING_WATCH: 'CALVING_WATCH',
  PREGNANCY_CHECK: 'PREGNANCY_CHECK',
  SYNC_INJECTION: 'INJECTION',
  DRY_OFF: 'DRY_OFF',
  POSTPARTUM_CHECK: 'POSTPARTUM_CHECK',
};

export const DECISION_TASK_TYPES: TaskType[] = [
  'REPEAT_BREEDER',
  'ANESTRUS_MINERAL',
  'ANESTRUS_VET',
  'ANESTRUS_DECISION',
  'PROTOCOL_BROKEN',
  'CYCLING_UNBRED',
  'PD_STALLED',
];

const GROUP_META: Record<
  BoardGroupKey,
  { labelEn: string; labelNp: string; colour: BoardGroupDto['colour']; subEn: string; subNp: string }
> = {
  BREED_TODAY: {
    labelEn: 'Breed today',
    labelNp: 'आज गर्भाधान',
    colour: 'RED',
    subEn: 'window closes {time}',
    subNp: 'झ्याल {time} मा बन्द',
  },
  CHECK_HEAT: {
    labelEn: 'Check for heat',
    labelNp: 'रजस्वला हेर्नुहोस्',
    colour: 'YELLOW',
    subEn: 'between 4 and 7 am',
    subNp: 'बिहान ४ देखि ७ बजे',
  },
  CALVING_WATCH: {
    labelEn: 'Calving watch',
    labelNp: 'बियाइ हेर्नुहोस्',
    colour: 'BLUE',
    subEn: 'due {date}',
    subNp: '{date} मा ब्याउने',
  },
  PREGNANCY_CHECK: {
    labelEn: 'Pregnancy check',
    labelNp: 'गर्भ जाँच',
    colour: 'BLUE',
    subEn: 'next scheduled vet visit',
    subNp: 'पशु चिकित्सकको अर्को भ्रमण',
  },
  INJECTION: {
    labelEn: 'Injection',
    labelNp: 'सुई',
    colour: 'PURPLE',
    subEn: 'protocol day',
    subNp: 'प्रोटोकल दिन',
  },
  DRY_OFF: {
    labelEn: 'Dry off',
    labelNp: 'दूध बन्द',
    colour: 'AMBER',
    subEn: 'stop milking',
    subNp: 'दूध रोक्नुहोस्',
  },
  POSTPARTUM_CHECK: {
    labelEn: 'Post-calving check',
    labelNp: 'बियाएपछिको जाँच',
    colour: 'GREY',
    subEn: 'days after calving',
    subNp: 'बियाएको दिन',
  },
};

export interface BoardTaskRow {
  id: string;
  type: TaskType;
  titleEn: string;
  titleNp: string;
  dueAt: Date;
  priority: TaskPriority;
  animalId: string | null;
  sourceRefType?: string | null;
  metadata?: Record<string, string | number | null | undefined>;
}

export interface BoardAnimalRow {
  id: string;
  herdNumber: string | null;
  tag: string;
  name: string | null;
  species: string;
  shed: string | null;
  photoUrl: string | null;
  penName?: string | null;
  penSortOrder?: number | null;
  seqNo?: number | null;
  technicianName?: string | null;
  technicianPhone?: string | null;
}

export function seqFromHerd(herdNumber: string | null | undefined): number {
  const digits = (herdNumber ?? '').replace(/\D/g, '');
  return digits ? Number(digits) : 0;
}

export function boardContext(
  type: TaskType,
  meta: Record<string, string | number | null | undefined> = {},
): { contextEn: string; contextNp: string } {
  const n = Number(meta.n ?? 0);
  const time = String(meta.time ?? '');
  const deadline = String(meta.deadline ?? '');
  const protocol = String(meta.protocol ?? '');
  const drug = String(meta.drug ?? '');
  const dose = String(meta.dose ?? '');
  switch (type) {
    case 'SERVICE_WINDOW':
    case 'SYNC_AI':
      return {
        contextEn: `heat ${time}, breed before ${deadline}`,
        contextNp: `गर्मी ${time}, ${deadline} अघि गर्भाधान`,
      };
    case 'HEAT_WATCH':
      return {
        contextEn: `due today, cycle day ${n}`,
        contextNp: `आज आउने सम्भावना, चक्र दिन ${n}`,
      };
    case 'SILENT_HEAT_CHECK':
      return {
        contextEn: `${n} days quiet — silent heat likely`,
        contextNp: `${n} दिन शान्त — लुकेको गर्मी हुनसक्छ`,
      };
    case 'PREGNANCY_CHECK':
      return {
        contextEn: `bred ${n} days ago`,
        contextNp: `${n} दिन अघि गर्भाधान`,
      };
    case 'CALVING_WATCH':
      return {
        contextEn: `calves in ${n} days`,
        contextNp: `${n} दिनमा ब्याउँछ`,
      };
    case 'SYNC_INJECTION':
      return {
        contextEn: `${protocol} day ${n} — ${drug}, ${dose}`,
        contextNp: `${protocol} दिन ${n} — ${drug}, ${dose}`,
      };
    case 'DRY_OFF':
      return {
        contextEn: `calves in ${n} days, stop milking`,
        contextNp: `${n} दिनमा ब्याउँछ, दूध बन्द गर्नुहोस्`,
      };
    case 'POSTPARTUM_CHECK':
      return {
        contextEn: `${n} days after calving`,
        contextNp: `ब्याएको ${n} दिन`,
      };
    default:
      return { contextEn: '', contextNp: '' };
  }
}

export function boardActions(
  type: TaskType,
  animal: BoardAnimalRow,
  opts: { animalId: string; taskId: string },
): BoardItemDto['actions'] {
  const cycle = (form: string) => `/breeding?form=${form}&animalId=${opts.animalId}`;
  if (type === 'SERVICE_WINDOW' || type === 'SYNC_AI') {
    const actions: BoardItemDto['actions'] = [];
    if (animal.technicianPhone) {
      actions.push({
        key: 'CALL_TECHNICIAN',
        labelEn: animal.technicianName ? `Call ${animal.technicianName}` : 'Call technician',
        labelNp: animal.technicianName ? `${animal.technicianName} लाई फोन` : 'प्राविधिकलाई फोन',
        phone: animal.technicianPhone,
      });
    }
    actions.push({
      key: 'RECORD_SERVICE',
      labelEn: 'Record service',
      labelNp: 'गर्भाधान दर्ता',
      primary: true,
      to: cycle('service'),
    });
    return actions;
  }
  if (type === 'HEAT_WATCH' || type === 'SILENT_HEAT_CHECK') {
    return [
      { key: 'SAW_HEAT', labelEn: 'Saw heat', labelNp: 'रजस्वला देखियो', primary: true, to: cycle('heat') },
      { key: 'NOTHING', labelEn: 'Nothing', labelNp: 'केही होइन' },
    ];
  }
  if (type === 'PREGNANCY_CHECK') {
    return [
      { key: 'RECORD_PD', labelEn: 'Record check', labelNp: 'जाँच लेख्नुहोस्', primary: true, to: cycle('pd') },
    ];
  }
  if (type === 'CALVING_WATCH') {
    return [
      { key: 'RECORD_CALVING', labelEn: 'Record calving', labelNp: 'बियाइ लेख्नुहोस्', primary: true, to: cycle('calving') },
    ];
  }
  if (type === 'SYNC_INJECTION') {
    return [{ key: 'GIVEN', labelEn: 'Given', labelNp: 'दिएँ', primary: true }];
  }
  if (type === 'DRY_OFF') {
    return [
      { key: 'DRIED_OFF', labelEn: 'Still pregnant — dried off', labelNp: 'गर्भ छ — दूध बन्द भयो', primary: true },
      { key: 'EMPTY_AT_DRY_OFF', labelEn: 'She is empty', labelNp: 'गर्भ छैन' },
    ];
  }
  if (type === 'POSTPARTUM_CHECK') {
    return [
      {
        key: 'RECORD_CHECK',
        labelEn: 'Record check',
        labelNp: 'जाँच लेख्नुहोस्',
        primary: true,
        to: `/health?animalId=${opts.animalId}&type=CHECKUP`,
      },
    ];
  }
  return [];
}

export function decisionActions(kind: TaskType, animalId: string): BoardItemDto['actions'] {
  const enroll = {
    key: 'START_PROTOCOL',
    labelEn: 'Start protocol',
    labelNp: 'प्रोटोकल सुरु',
    primary: true,
  };
  const breed = {
    key: 'BREED_AGAIN',
    labelEn: 'Breed again',
    labelNp: 'फेरि गर्भाधान',
    to: `/breeding?form=service&animalId=${animalId}`,
  };
  const mineral = {
    key: 'MINERAL_STARTED',
    labelEn: 'Mineral started',
    labelNp: 'खनिज सुरु',
    primary: true,
  };
  const pd = {
    key: 'RECORD_PD',
    labelEn: 'Record check',
    labelNp: 'जाँच लेख्नुहोस्',
    primary: true,
    to: `/breeding?form=pd&animalId=${animalId}`,
  };
  if (kind === 'ANESTRUS_MINERAL') return [mineral, enroll];
  if (kind === 'ANESTRUS_VET' || kind === 'ANESTRUS_DECISION' || kind === 'PROTOCOL_BROKEN') {
    return [enroll, breed];
  }
  if (kind === 'REPEAT_BREEDER' || kind === 'CYCLING_UNBRED') return [breed, enroll];
  if (kind === 'PD_STALLED') return [pd, enroll];
  return [breed];
}

export function compareWalkOrder(a: BoardItemDto, b: BoardItemDto): number {
  if (a.penSortOrder !== b.penSortOrder) return a.penSortOrder - b.penSortOrder;
  if (a.seqNo !== b.seqNo) return a.seqNo - b.seqNo;
  return a.shortNo.localeCompare(b.shortNo);
}

/** One animal per group — extra calving/heat watches collapse to the closest due. */
export function collapseByAnimal(
  items: BoardItemDto[],
  tasks: BoardTaskRow[],
  now: Date,
): BoardItemDto[] {
  const due = new Map(tasks.map((row) => [row.id, row.dueAt.getTime()]));
  const best = new Map<string, BoardItemDto>();
  for (const item of items) {
    const current = best.get(item.animalId);
    if (!current) {
      best.set(item.animalId, item);
      continue;
    }
    if (item.taskType === 'SILENT_HEAT_CHECK' && current.taskType === 'HEAT_WATCH') {
      best.set(item.animalId, item);
      continue;
    }
    if (item.taskType === 'SYNC_AI' && current.taskType === 'SERVICE_WINDOW') {
      best.set(item.animalId, item);
      continue;
    }
    const itemDue = due.get(item.taskId) ?? 0;
    const currentDue = due.get(current.taskId) ?? 0;
    if (Math.abs(itemDue - now.getTime()) < Math.abs(currentDue - now.getTime())) {
      best.set(item.animalId, item);
    }
  }
  return [...best.values()];
}

export function buildBreedingBoard(input: {
  date: string;
  now: Date;
  role: Role;
  tasks: BoardTaskRow[];
  animals: BoardAnimalRow[];
}): BreedingBoardDto {
  const byId = new Map(input.animals.map((row) => [row.id, row]));
  const buckets = new Map<BoardGroupKey, BoardItemDto[]>();
  const decisions: BoardDecisionDto[] = [];
  let overdue = 0;
  const start = new Date(`${input.date}T00:00:00+05:45`);

  for (const task of input.tasks) {
    if (!task.animalId) continue;
    const animal = byId.get(task.animalId);
    if (!animal) continue;
    if (task.dueAt.getTime() < start.getTime()) overdue += 1;
    if (DECISION_TASK_TYPES.includes(task.type)) {
      decisions.push({
        taskId: task.id,
        animalId: animal.id,
        shortNo: animal.herdNumber ?? animal.tag,
        name: animal.name,
        titleEn: task.titleEn,
        titleNp: task.titleNp,
        kind: task.type,
        actions: decisionActions(task.type, animal.id),
      });
      continue;
    }
    const group = BOARD_TASK_GROUP[task.type];
    if (!group) continue;
    const shortNo = animal.herdNumber ?? animal.tag;
    const ctx = boardContext(task.type, task.metadata);
    const item: BoardItemDto = {
      taskId: task.id,
      taskType: task.type,
      animalId: animal.id,
      shortNo,
      name: animal.name,
      species: animal.species,
      penName: animal.penName ?? animal.shed ?? '—',
      penSortOrder: animal.penSortOrder ?? 999,
      seqNo: animal.seqNo ?? seqFromHerd(animal.herdNumber),
      photoUrl: animal.photoUrl,
      contextEn: ctx.contextEn,
      contextNp: ctx.contextNp,
      deadline:
        task.type === 'SERVICE_WINDOW' || task.type === 'SYNC_AI'
          ? task.metadata?.deadlineIso
            ? String(task.metadata.deadlineIso)
            : task.dueAt.toISOString()
          : null,
      actions: boardActions(task.type, animal, { animalId: animal.id, taskId: task.id }),
    };
    const list = buckets.get(group) ?? [];
    list.push(item);
    buckets.set(group, list);
  }

  const groups: BoardGroupDto[] = [];
  for (const key of BOARD_GROUP_ORDER) {
    const items = collapseByAnimal(buckets.get(key) ?? [], input.tasks, input.now).sort(compareWalkOrder);
    if (items.length === 0) continue;
    const meta = GROUP_META[key]!;
    let subEn = meta.subEn;
    let subNp = meta.subNp;
    if (key === 'BREED_TODAY') {
      const latest = items
        .map((row) => row.deadline)
        .filter(Boolean)
        .sort()
        .at(-1);
      const time = latest
        ? new Date(latest).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true })
        : '';
      subEn = `window closes ${time}`;
      subNp = `झ्याल ${time} मा बन्द`;
    }
    groups.push({
      key,
      labelEn: meta.labelEn,
      labelNp: meta.labelNp,
      colour: meta.colour,
      subLabelEn: subEn,
      subLabelNp: subNp,
      items,
    });
  }

  const canSeeDecisions = input.role === 'MANAGER' || input.role === 'ADMIN';
  return {
    date: input.date,
    groups,
    decisionQueue: {
      count: decisions.length,
      items: canSeeDecisions ? decisions : [],
    },
    summary: {
      totalActions: groups.reduce((sum, group) => sum + group.items.length, 0),
      overdue,
    },
  };
}
