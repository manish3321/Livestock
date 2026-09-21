import type { RecordingMode, ScanResolveDto } from '@farm/contracts';

type RosterLike = {
  id: string;
  shortNo: string | null;
  name: string | null;
  species: string;
  penName: string | null;
  photoUrl: string | null;
  status?: string;
  isPregnant?: boolean;
  withholdActive?: boolean;
  usualLitres?: number | null;
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function nextActionFor(mode: RecordingMode): ScanResolveDto['nextAction'] {
  switch (mode) {
    case 'VACCINATION':
    case 'TREATMENT':
      return 'DOSE_CONFIRM';
    case 'WEIGHING':
      return 'WEIGHT_ENTRY';
    case 'HEALTH_CHECK':
      return 'SYMPTOM_PICKER';
    case 'MARKER_PLACEMENT':
      return 'MARKER_CONFIRM';
    case 'BROWSE':
      return 'PROFILE';
    default:
      return 'MILK_ENTRY';
  }
}

/** Build a pad-ready scan DTO from the in-memory roster so the UI opens instantly. */
export function optimisticScanFromRoster(animal: RosterLike, mode: RecordingMode): ScanResolveDto {
  const mean = animal.usualLitres ?? null;
  return {
    animal: {
      id: animal.id,
      shortNo: animal.shortNo,
      name: animal.name,
      nameNp: animal.name,
      species: animal.species,
      penName: animal.penName,
      photoUrl: animal.photoUrl,
    },
    status: {
      status: animal.status ?? 'ACTIVE',
      isPregnant: animal.isPregnant ?? false,
      daysInMilk: null,
      daysToCalving: null,
    },
    blocks: animal.withholdActive
      ? [
          {
            kind: 'MILK_WITHHOLD',
            until: new Date().toISOString().slice(0, 10),
            drug: null,
            messageNp: 'दूध बेच्नु हुँदैन',
            blocksDisposal: ['SOLD'],
          },
        ]
      : [],
    markers: [],
    context: {
      rolling7Mean: mean,
      alreadyRecordedThisRound: false,
      existingValue: null,
      existingEntryId: null,
      expectedRangeLow: mean != null ? round1(mean * 0.6) : null,
      expectedRangeHigh: mean != null ? round1(mean * 1.4) : null,
    },
    nextAction: nextActionFor(mode),
  };
}

export function matchRosterByQuery<T extends { id: string; shortNo: string | null; tag?: string; name: string | null }>(
  rows: T[],
  q: string,
): T[] {
  const raw = q.trim();
  if (!raw) return [];
  const upper = raw.toUpperCase();
  const digits = raw.replace(/\D/g, '').replace(/^0+/, '');
  return rows.filter((a) => {
    const hn = (a.shortNo ?? '').toUpperCase();
    const tag = (a.tag ?? '').toUpperCase();
    const name = (a.name ?? '').toUpperCase();
    return (
      a.id === raw ||
      hn === upper ||
      tag === upper ||
      name.includes(upper) ||
      (digits.length > 0 && (hn.endsWith(digits) || tag.endsWith(digits)))
    );
  });
}
