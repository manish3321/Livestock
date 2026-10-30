import type {
  BoardDecisionDto,
  BoardGroupDto,
  BoardGroupKey,
  BoardItemDto,
  BoardUrgency,
  BreedingBoardDto,
  Role,
  TaskPriority,
  TaskType,
} from '@farm/contracts';

export type { BoardItemDto, BoardGroupDto, BreedingBoardDto } from '@farm/contracts';

export const BOARD_GROUP_ORDER: BoardGroupKey[] = [
  'BREED_TODAY',
  'COLOSTRUM',
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
  COLOSTRUM_FEED: 'COLOSTRUM',
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
  COLOSTRUM: {
    labelEn: 'Colostrum',
    labelNp: 'पहिलो दूध',
    colour: 'RED',
    subEn: 'within 2 hours of birth',
    subNp: 'जन्मको २ घण्टाभित्र',
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
  const t = boardTiming(type, meta, false);
  return { contextEn: t.contextEn, contextNp: t.contextNp };
}

/** Human timing line: Do by / Why / late consequence + urgency for Walk rows. */
export function boardTiming(
  type: TaskType,
  meta: Record<string, string | number | null | undefined> = {},
  late: boolean,
): {
  doByEn: string;
  doByNp: string;
  whyEn: string;
  whyNp: string;
  lateEn: string | null;
  lateNp: string | null;
  urgency: BoardUrgency;
  contextEn: string;
  contextNp: string;
} {
  const n = Number(meta.n ?? 0);
  const time = String(meta.time ?? '');
  const deadline = String(meta.deadline ?? '');
  const protocol = String(meta.protocol ?? '');
  const drug = String(meta.drug ?? '');
  const dose = String(meta.dose ?? '');

  let doByEn = 'today before evening';
  let doByNp = 'आज साँझ अघि';
  let whyEn = '';
  let whyNp = '';
  let lateEn: string | null = null;
  let lateNp: string | null = null;
  let urgency: BoardUrgency = late ? 'AMBER' : 'NORMAL';

  switch (type) {
    case 'SERVICE_WINDOW':
    case 'SYNC_AI':
      doByEn = deadline ? `before ${deadline}` : 'today before evening';
      doByNp = deadline ? `${deadline} अघि` : 'आज साँझ अघि';
      whyEn = time ? `12–18h after standing heat (${time})` : '12–18h after standing heat';
      whyNp = time ? `उभिएको रजस्वलापछि १२–१८ घण्टा (${time})` : 'उभिएको रजस्वलापछि १२–१८ घण्टा';
      lateEn = 'window closing';
      lateNp = 'झ्याल बन्द हुँदै';
      urgency = late ? 'RED' : 'AMBER';
      break;
    case 'HEAT_WATCH':
      doByEn = 'today 4–7 am';
      doByNp = 'आज बिहान ४–७';
      whyEn = `cycle day ${n}`;
      whyNp = `चक्र दिन ${n}`;
      lateEn = 'heat may be missed';
      lateNp = 'रजस्वला छुट्न सक्छ';
      break;
    case 'SILENT_HEAT_CHECK':
      doByEn = 'today before evening';
      doByNp = 'आज साँझ अघि';
      whyEn = `${n} days quiet — silent heat likely`;
      whyNp = `${n} दिन शान्त — लुकेको गर्मी हुनसक्छ`;
      lateEn = 'anestrus risk rising';
      lateNp = 'अनिस्ट्रस जोखिम बढ्दै';
      break;
    case 'PREGNANCY_CHECK':
      doByEn = 'today before evening';
      doByNp = 'आज साँझ अघि';
      whyEn = `PD day ${n}`;
      whyNp = `गर्भ जाँच दिन ${n}`;
      lateEn = 'recheck overdue';
      lateNp = 'पुनः जाँच ढिलो';
      break;
    case 'CALVING_WATCH':
      doByEn = n <= 0 ? 'today — watch closely' : `watch — calves in ${n} days`;
      doByNp = n <= 0 ? 'आज — नजिकबाट हेर्नुहोस्' : `${n} दिनमा ब्याउने — हेर्नुहोस्`;
      whyEn = 'calving window';
      whyNp = 'बियाइ झ्याल';
      // Task due can lag before the real EDD — only say “calving overdue” when n ≤ 0.
      lateEn = n <= 0 ? 'calving overdue' : 'watch check overdue';
      lateNp = n <= 0 ? 'बियाइ ढिलो' : 'हेर्ने जाँच ढिलो';
      urgency = n <= 0 ? 'RED' : late ? 'AMBER' : 'NORMAL';
      break;
    case 'SYNC_INJECTION':
      doByEn = 'today before evening';
      doByNp = 'आज साँझ अघि';
      whyEn = `${protocol} day ${n} — ${drug}, ${dose}`.replace(/ — , $/, '').trim();
      whyNp = `${protocol} दिन ${n} — ${drug}, ${dose}`.replace(/ — , $/, '').trim();
      lateEn = 'protocol will break';
      lateNp = 'प्रोटोकल बिग्रन्छ';
      urgency = late ? 'RED' : 'AMBER';
      break;
    case 'DRY_OFF':
      doByEn = 'today before evening';
      doByNp = 'आज साँझ अघि';
      whyEn = `calves in ${n} days — stop milking`;
      whyNp = `${n} दिनमा ब्याउँछ — दूध बन्द`;
      lateEn = 'dry-off late';
      lateNp = 'दूध बन्द ढिलो';
      break;
    case 'POSTPARTUM_CHECK':
      doByEn = 'today before evening';
      doByNp = 'आज साँझ अघि';
      whyEn = `${n} days after calving`;
      whyNp = `ब्याएको ${n} दिन`;
      lateEn = 'check overdue';
      lateNp = 'जाँच ढिलो';
      break;
    case 'COLOSTRUM_FEED': {
      doByEn = 'within 2 hours of birth';
      doByNp = 'जन्मको २ घण्टाभित्र';
      whyEn = n > 0 ? `${n}h after birth` : 'first feed';
      whyNp = n > 0 ? `जन्मपछि ${n} घण्टा` : 'पहिलो खुराक';
      if (n <= 2) urgency = 'GREEN';
      else if (n <= 6) urgency = 'AMBER';
      else urgency = 'RED';
      lateEn = n > 6 ? 'antibodies dropping — FPT risk' : 'window closing';
      lateNp = n > 6 ? 'अन्टिबडी झर्दै — FPT जोखिम' : 'झ्याल बन्द हुँदै';
      break;
    }
    default:
      break;
  }

  if (!late) {
    lateEn = null;
    lateNp = null;
  } else if (!lateEn) {
    lateEn = 'late';
    lateNp = 'ढिलो';
  }

  const whyPartEn = whyEn;
  const whyPartNp = whyNp;
  const latePartEn = lateEn ? ` · ${lateEn}` : '';
  const latePartNp = lateNp ? ` · ${lateNp}` : '';
  const contextEn = `Do by: ${doByEn}. Why: ${whyPartEn}${latePartEn}`;
  const contextNp = `कहिले: ${doByNp}. किन: ${whyPartNp}${latePartNp}`;

  return {
    doByEn,
    doByNp,
    whyEn: whyPartEn,
    whyNp: whyPartNp,
    lateEn,
    lateNp,
    urgency,
    contextEn,
    contextNp,
  };
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
  if (type === 'COLOSTRUM_FEED') {
    return [
      {
        key: 'RECORD_COLOSTRUM',
        labelEn: 'Record colostrum',
        labelNp: 'पहिलो दूध लेख्नुहोस्',
        primary: true,
        to: cycle('colostrum'),
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

/**
 * One animal per group. Prefer today's heat watch over quiet/anestrus spam;
 * quiet details stay on Watch. Sync AI beats a plain service window.
 */
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
    // Walk keeps one quiet/heat row — prefer HEAT_WATCH (today's work).
    if (item.taskType === 'HEAT_WATCH' && current.taskType === 'SILENT_HEAT_CHECK') {
      best.set(item.animalId, item);
      continue;
    }
    if (item.taskType === 'SILENT_HEAT_CHECK' && current.taskType === 'HEAT_WATCH') {
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
    const late = task.dueAt.getTime() < start.getTime();
    if (late) overdue += 1;
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
    const timing = boardTiming(task.type, task.metadata, late);
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
      contextEn: timing.contextEn,
      contextNp: timing.contextNp,
      doByEn: timing.doByEn,
      doByNp: timing.doByNp,
      whyEn: timing.whyEn,
      whyNp: timing.whyNp,
      lateEn: timing.lateEn,
      lateNp: timing.lateNp,
      urgency: timing.urgency,
      deadline:
        task.type === 'SERVICE_WINDOW' || task.type === 'SYNC_AI'
          ? task.metadata?.deadlineIso
            ? String(task.metadata.deadlineIso)
            : task.dueAt.toISOString()
          : task.type === 'COLOSTRUM_FEED'
            ? task.dueAt.toISOString()
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
    let colour = meta.colour;
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
    if (key === 'CALVING_WATCH') {
      const soonest = Math.min(
        ...items.map((row) => {
          const match = row.whyEn.match(/calving window/) ? row.doByEn.match(/(\d+) days/) : null;
          if (row.doByEn.includes('today')) return 0;
          return match ? Number(match[1]) : 999;
        }),
      );
      const label = soonest <= 0 ? 'today' : `in ${soonest} days`;
      const labelNp = soonest <= 0 ? 'आज' : `${soonest} दिनमा`;
      subEn = `due ${label}`;
      subNp = `${labelNp} ब्याउने`;
    }
    if (key === 'COLOSTRUM') {
      if (items.some((row) => row.urgency === 'RED')) {
        colour = 'RED';
        subEn = 'over 6 hours — FPT risk';
        subNp = '६ घण्टा नाघ्यो — FPT जोखिम';
      } else if (items.some((row) => row.urgency === 'AMBER')) {
        colour = 'AMBER';
        subEn = '2–6 hours — antibodies falling';
        subNp = '२–६ घण्टा — अन्टिबडी झर्दै';
      } else {
        colour = 'GREEN';
        subEn = 'within 2 hours — still on time';
        subNp = '२ घण्टाभित्र — अझै समय छ';
      }
    }
    groups.push({
      key,
      labelEn: meta.labelEn,
      labelNp: meta.labelNp,
      colour,
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
