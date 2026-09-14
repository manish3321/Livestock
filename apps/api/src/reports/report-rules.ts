export function nepalDayBoundsUtc(date: Date): { from: Date; to: Date } {
  const from = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + 1));
  return { from, to };
}

export function monthBoundsUtc(year: number, month: number): { from: Date; to: Date } {
  return {
    from: new Date(Date.UTC(year, month - 1, 1)),
    to: new Date(Date.UTC(year, month, 1)),
  };
}

export type CoopDayRow = {
  date: string;
  litresSent: number;
  litresAccepted: number;
  litresRejected: number;
  fat: number | null;
  snf: number | null;
  scc: number | null;
};

export function groupCooperativeByDay(
  rows: Array<{
    date: Date;
    litresSent: number;
    litresAccepted: number | null;
    litresRejected: number | null;
    fat: number | null;
    snf: number | null;
    scc: number | null;
  }>,
): CoopDayRow[] {
  const buckets = new Map<
    string,
    { row: CoopDayRow; fatW: number; fatD: number; snfW: number; snfD: number; sccW: number; sccD: number }
  >();
  for (const item of rows) {
    const date = item.date.toISOString().slice(0, 10);
    const cur = buckets.get(date) ?? {
      row: {
        date,
        litresSent: 0,
        litresAccepted: 0,
        litresRejected: 0,
        fat: null,
        snf: null,
        scc: null,
      },
      fatW: 0,
      fatD: 0,
      snfW: 0,
      snfD: 0,
      sccW: 0,
      sccD: 0,
    };
    cur.row.litresSent += item.litresSent;
    cur.row.litresAccepted += item.litresAccepted ?? 0;
    cur.row.litresRejected += item.litresRejected ?? 0;
    const weight = item.litresSent;
    if (item.fat != null && weight > 0) {
      cur.fatW += item.fat * weight;
      cur.fatD += weight;
    }
    if (item.snf != null && weight > 0) {
      cur.snfW += item.snf * weight;
      cur.snfD += weight;
    }
    if (item.scc != null && weight > 0) {
      cur.sccW += item.scc * weight;
      cur.sccD += weight;
    }
    buckets.set(date, cur);
  }
  return [...buckets.values()]
    .map(({ row, fatW, fatD, snfW, snfD, sccW, sccD }) => ({
      ...row,
      fat: fatD > 0 ? fatW / fatD : null,
      snf: snfD > 0 ? snfW / snfD : null,
      scc: sccD > 0 ? Math.round(sccW / sccD) : null,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
