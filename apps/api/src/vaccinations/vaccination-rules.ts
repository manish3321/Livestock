const DAY = 24 * 60 * 60 * 1000;

export type ProtocolRow = {
  id: string;
  disease: string;
  diseaseNp: string | null;
  species: string[];
  trigger: string;
  triggerAgeDays: number | null;
  triggerMonth: number | null;
  boosterAfterDays: number | null;
  repeatIntervalDays: number | null;
  sexRestriction: string;
  pregnancyContraindicated: boolean;
  active: boolean;
};

export type LotRow = {
  id: string;
  expiryDate: Date | null;
  qtyRemaining: number;
  receivedOn: Date;
  lotNumber: string;
};

export function ageDays(dob: Date | null | undefined, now: Date): number | null {
  if (!dob) return null;
  return Math.floor((now.getTime() - dob.getTime()) / DAY);
}

export function appliesToAnimal(
  protocol: ProtocolRow,
  animal: { species: string; gender: string; isPregnant: boolean },
): boolean {
  if (!protocol.active) return false;
  if (protocol.species.length && !protocol.species.includes(animal.species)) return false;
  if (protocol.sexRestriction === 'FEMALE' && animal.gender !== 'FEMALE') return false;
  if (protocol.sexRestriction === 'MALE' && animal.gender !== 'MALE') return false;
  if (protocol.pregnancyContraindicated && animal.isPregnant) return false;
  return true;
}

export function intervalDaysFor(protocol: ProtocolRow, age: number | null): number | null {
  if (protocol.disease === 'DEWORMING' && age != null && age < 180) return 30;
  return protocol.repeatIntervalDays;
}

export function nextDueDate(
  protocol: ProtocolRow,
  animal: { dateOfBirth: Date | null },
  lastAt: Date | null,
  lastWasBooster: boolean,
  now: Date,
  horizon: Date,
): Date | null {
  const age = ageDays(animal.dateOfBirth, now);
  if (protocol.triggerAgeDays != null && age != null && age < protocol.triggerAgeDays && !lastAt) {
    const first = new Date(animal.dateOfBirth!.getTime() + protocol.triggerAgeDays * DAY);
    return first <= horizon ? first : null;
  }

  if (protocol.disease === 'ECTOPARASITE') {
    const month = now.getMonth() + 1;
    if (month < 6 || month > 9) {
      const june = new Date(now.getFullYear(), 5, 1);
      if (june < now) june.setFullYear(june.getFullYear() + 1);
      return june <= horizon ? june : null;
    }
  }

  if (!lastAt) {
    if (protocol.trigger === 'SEASONAL' && protocol.triggerMonth) {
      const seasonal = seasonalDue(protocol.triggerMonth, now);
      return seasonal <= horizon ? (seasonal < now ? now : seasonal) : null;
    }
    if (protocol.triggerAgeDays != null && animal.dateOfBirth) {
      const first = new Date(animal.dateOfBirth.getTime() + protocol.triggerAgeDays * DAY);
      const due = first < now ? now : first;
      return due <= horizon ? due : null;
    }
    return now <= horizon ? now : null;
  }

  if (protocol.boosterAfterDays && !lastWasBooster) {
    const booster = new Date(lastAt.getTime() + protocol.boosterAfterDays * DAY);
    return booster <= horizon ? booster : null;
  }

  const interval = intervalDaysFor(protocol, age);
  if (!interval) return null;
  const next = new Date(lastAt.getTime() + interval * DAY);
  if (protocol.trigger === 'SEASONAL' && protocol.triggerMonth) {
    const seasonal = seasonalDue(protocol.triggerMonth, now);
    return seasonal <= horizon ? seasonal : null;
  }
  return next <= horizon ? (next < now ? now : next) : null;
}

function seasonalDue(month: number, now: Date): Date {
  const due = new Date(now.getFullYear(), month - 1, 1);
  if (due < now) due.setFullYear(due.getFullYear() + 1);
  return due;
}

/** Earliest expiry first. Negative remaining is allowed (Guardrail 2.4). */
export function pickFefoLot(lots: LotRow[]): LotRow | null {
  const sorted = [...lots].sort((a, b) => {
    const ae = a.expiryDate?.getTime() ?? Number.POSITIVE_INFINITY;
    const be = b.expiryDate?.getTime() ?? Number.POSITIVE_INFINITY;
    if (ae !== be) return ae - be;
    return a.receivedOn.getTime() - b.receivedOn.getTime();
  });
  return sorted[0] ?? null;
}

export function lotIsExpired(lot: { expiryDate: Date | null }, at: Date): boolean {
  return lot.expiryDate != null && lot.expiryDate.getTime() < at.getTime();
}
