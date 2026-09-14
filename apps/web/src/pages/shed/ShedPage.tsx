import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Html5Qrcode } from 'html5-qrcode';
import type { MilkSession, RecordingMode, RoundSkipReason } from '@farm/contracts';
import { NEPAL_VACCINE_PROTOCOLS, RECORDING_MODES } from '@farm/contracts';
import { batchVaccinate } from '../../api/health';
import { listInventory } from '../../api/inventory';
import { ApiRequestError } from '../../api/client';
import { api } from '../../api/client';
import { getMilkRound, updateTank } from '../../api/milk';
import {
  finishRound,
  getActiveRound,
  getRoundRemaining,
  postScan,
  searchAnimals,
  startRound,
  type ScanResolveDto,
} from '../../api/rounds';
import { parseQrPayload } from '../../lib/qr';
import { shedFeedback } from '../../lib/shed-feedback';
import {
  cacheScan,
  cachedScan,
  flushShedQueue,
  readActiveRound,
  readShedCache,
  rememberActiveRound,
  resolveCachedByNumber,
  saveMilkOnlineOrQueue,
  writeShedCache,
} from '../../lib/shed-offline';

type ScanCreateMethod = 'CAMERA' | 'MANUAL_NUMBER' | 'LIST_TAP' | 'PHOTO_PICK' | 'NFC';

const SESSIONS: MilkSession[] = ['MORNING', 'EVENING', 'MIDDAY'];
const DISPOSALS = ['SOLD', 'FED_TO_CALVES', 'HOUSEHOLD', 'DISCARDED'] as const;
const SKIP_REASONS: RoundSkipReason[] = ['NOT_MILKED', 'FORGOT'];

function minutesNow(): number {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}

function nearHour(hour: number): boolean {
  const target = hour * 60;
  const now = minutesNow();
  return [0, 1440, -1440].some((wrap) => Math.abs(now - target + wrap) <= 90);
}

function defaultSession(morningHour: number, eveningHour: number): MilkSession {
  if (nearHour(morningHour)) return 'MORNING';
  if (nearHour(eveningHour)) return 'EVENING';
  const hour = new Date().getHours();
  if (hour < 10) return 'MORNING';
  if (hour >= 15) return 'EVENING';
  return 'MIDDAY';
}

/** Shed OS: mode once, camera stays up, pad is the action. */
export function ShedPage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const modeParam = params.get('mode') as RecordingMode | null;
  const farmQ = useQuery({
    queryKey: ['farm-me'],
    queryFn: () =>
      api<{ morningMilkingHour: number; eveningMilkingHour: number }>('/v1/farms/me'),
  });
  const morningHour = farmQ.data?.morningMilkingHour ?? 5;
  const eveningHour = farmQ.data?.eveningMilkingHour ?? 17;

  const [mode, setMode] = useState<RecordingMode>(modeParam && RECORDING_MODES.includes(modeParam) ? modeParam : 'MILKING');
  const [session, setSession] = useState<MilkSession>(() => defaultSession(5, 17));
  const [roundId, setRoundId] = useState<string | null>(null);
  const [scan, setScan] = useState<ScanResolveDto | null>(null);
  const [digits, setDigits] = useState('');
  const [search, setSearch] = useState('');
  const [disposal, setDisposal] = useState<(typeof DISPOSALS)[number]>('SOLD');
  const [confirmRange, setConfirmRange] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<'ok' | 'bad' | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [skipDraft, setSkipDraft] = useState<Record<string, RoundSkipReason>>({});
  const [lastSaved, setLastSaved] = useState<{
    animalId: string;
    litres: string;
    entryId: string | null;
  } | null>(null);
  const [actual, setActual] = useState('');
  const [showPhotos, setShowPhotos] = useState(false);
  const [vaxItemId, setVaxItemId] = useState('');
  const [vaxDisease, setVaxDisease] = useState('FMD');
  const [cacheTick, setCacheTick] = useState(0);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScanAt = useRef(0);
  const saveTimer = useRef<number | null>(null);
  const cameraHostRef = useRef<HTMLDivElement | null>(null);
  const typedRef = useRef(false);
  const openedPreset = useRef(false);

  useEffect(() => {
    if (farmQ.data) setSession(defaultSession(farmQ.data.morningMilkingHour, farmQ.data.eveningMilkingHour));
  }, [farmQ.data]);

  const remainingQ = useQuery({
    queryKey: ['round-remaining', roundId],
    queryFn: () => getRoundRemaining(roundId!),
    enabled: !!roundId && navigator.onLine,
  });

  const tankQ = useQuery({
    queryKey: ['milk-round', remainingQ.data?.round.milkRoundId],
    queryFn: () => getMilkRound(remainingQ.data!.round.milkRoundId!),
    enabled: remainingQ.data?.round.status === 'FINISHED' && !!remainingQ.data.round.milkRoundId,
  });

  useEffect(() => {
    if (!remainingQ.data) return;
    writeShedCache({
      remaining: remainingQ.data.remaining,
      scans: readShedCache().scans,
      recorded: remainingQ.data.recorded,
      expected: remainingQ.data.expected,
    });
  }, [remainingQ.data]);

  useEffect(() => {
    const onOnline = () => void flushShedQueue().then(() => void remainingQ.refetch());
    window.addEventListener('online', onOnline);
    if (navigator.onLine) {
      void getActiveRound().then((active) => {
        if (active) {
          setRoundId(active.id);
          setMode(active.mode);
          if (active.session) setSession(active.session);
          rememberActiveRound(active.id, active.mode, active.session);
        }
      });
    } else {
      const cached = readActiveRound();
      if (cached) {
        setRoundId(cached.id);
        if (cached.mode) setMode(cached.mode as RecordingMode);
        if (cached.session) setSession(cached.session as MilkSession);
      }
    }
    return () => window.removeEventListener('online', onOnline);
  }, []);

  const inventoryQ = useQuery({
    queryKey: ['inventory', 'shed-vax'],
    queryFn: () => listInventory({ pageSize: 100 }),
    enabled: mode === 'VACCINATION' || mode === 'TREATMENT',
  });

  const start = useMutation({
    mutationFn: () =>
      startRound({
        mode,
        session: mode === 'MILKING' ? session : undefined,
        contextItemId: vaxItemId || undefined,
      }),
    onSuccess: (r) => {
      setRoundId(r.id);
      rememberActiveRound(r.id, r.mode, r.session);
      setError(null);
    },
  });

  const lookupQ = useQuery({
    queryKey: ['animal-search', search],
    queryFn: () => searchAnimals(search),
    enabled: search.trim().length >= 1 && !scan && navigator.onLine,
  });
  const lookupHits = navigator.onLine ? (lookupQ.data ?? []) : resolveCachedByNumber(search);

  const openAnimal = useCallback(
    async (raw: string, method: ScanCreateMethod) => {
      const cachedId = parseQrPayload(raw)?.kind === 'animal' ? parseQrPayload(raw)!.id : null;
      const offline = cachedId ? cachedScan(cachedId) : undefined;
      try {
        const dto = offline && !navigator.onLine
          ? offline
          : await postScan({ rawPayload: raw, method, roundId: roundId ?? undefined });
        cacheScan(dto);
        if (dto.nextAction === 'PROFILE') {
          navigate(`/animals/${dto.animal.id}`);
          return;
        }
        setScan(dto);
        typedRef.current = false;
        setDigits(dto.context.alreadyRecordedThisRound && dto.context.existingValue != null
          ? String(dto.context.existingValue)
          : '');
        setConfirmRange(false);
        setError(null);
        setDisposal(dto.blocks.some((b) => b.kind === 'MILK_WITHHOLD') ? 'DISCARDED' : 'SOLD');
      } catch (err) {
        shedFeedback('bad');
        setFlash('bad');
        setTimeout(() => setFlash(null), 700);
        if (err instanceof ApiRequestError) setError(err.error.message);
      }
    },
    [navigate, roundId],
  );

  useEffect(() => {
    const preset = params.get('animal');
    if (preset && roundId && !openedPreset.current) {
      openedPreset.current = true;
      void openAnimal(preset, 'LIST_TAP');
    }
  }, [params, roundId, openAnimal]);

  const save = useMutation({
    mutationFn: async () => {
      if (!scan || !roundId) throw new Error('no scan');
      const qty = Number(digits);
      if (!Number.isFinite(qty) || qty <= 0) throw new Error('qty');
      const low = scan.context.expectedRangeLow;
      const high = scan.context.expectedRangeHigh;
      if (!confirmRange && low != null && high != null && (qty < low || qty > high)) {
        throw Object.assign(new Error('range'), { code: 'YIELD_OUT_OF_RANGE' });
      }
      return saveMilkOnlineOrQueue(
        {
          animalId: scan.animal.id,
          session,
          litres: qty,
          disposal,
          roundId,
        },
        scan.context.existingEntryId,
      );
    },
    onSuccess: (result) => {
      const qty = digits;
      const name = scan?.animal.name ?? scan?.animal.shortNo ?? '';
      shedFeedback(
        'ok',
        i18n.language === 'ne' ? `${qty.replace('.', ' दशमलव ')}, ${name}` : undefined,
      );
      setLastSaved({
        animalId: scan!.animal.id,
        litres: qty,
        entryId: 'id' in result ? result.id : scan?.context.existingEntryId ?? null,
      });
      setDigits('');
      setConfirmRange(false);
      setError(null);
      setFlash('ok');
      setTimeout(() => setFlash(null), 400);
      setScan(null);
      const next = readShedCache();
      writeShedCache({
        ...next,
        remaining: next.remaining.filter((a) => a.id !== scan!.animal.id),
        recorded: (next.recorded ?? 0) + 1,
      });
      setCacheTick((n) => n + 1);
      void remainingQ.refetch();
    },
    onError: (err) => {
      if ((err as { code?: string }).code === 'YIELD_OUT_OF_RANGE') {
        setConfirmRange(true);
        setError(t('shed.confirmRange'));
        return;
      }
      setFlash('bad');
      shedFeedback('bad');
      setTimeout(() => setFlash(null), 700);
      if (err instanceof ApiRequestError) {
        if (err.error.code === 'DUPLICATE_MILK_RECORD') {
          setError(t('shed.alreadyRecorded'));
        } else {
          setError(err.error.message);
        }
      } else {
        setError(t('shed.saveFailed'));
      }
    },
  });

  const confirmDose = useMutation({
    mutationFn: async () => {
      if (!scan || !roundId) throw new Error('no scan');
      return batchVaccinate({
        animalIds: [scan.animal.id],
        itemId: vaxItemId || undefined,
        disease: vaxDisease,
        administeredAt: new Date(),
        doseAmount: 2,
        route: 'SUBCUTANEOUS',
        roundId,
      });
    },
    onSuccess: (res) => {
      if (res.skipped.length) {
        setError(t('health.skippedPregnant', { n: res.skipped.length }));
        setFlash('bad');
        shedFeedback('bad');
        setTimeout(() => setFlash(null), 700);
        setScan(null);
        void remainingQ.refetch();
        return;
      }
      shedFeedback('ok');
      setFlash('ok');
      setTimeout(() => setFlash(null), 400);
      setError(null);
      const next = readShedCache();
      writeShedCache({
        ...next,
        remaining: next.remaining.filter((a) => a.id !== scan!.animal.id),
        recorded: (next.recorded ?? 0) + 1,
      });
      setCacheTick((n) => n + 1);
      setScan(null);
      void remainingQ.refetch();
    },
    onError: (err) => {
      setFlash('bad');
      shedFeedback('bad');
      setTimeout(() => setFlash(null), 700);
      if (err instanceof ApiRequestError) setError(err.error.message);
      else setError(t('shed.saveFailed'));
    },
  });

  useEffect(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    if (!scan || mode !== 'MILKING' || !digits || confirmRange || !typedRef.current) return;
    saveTimer.current = window.setTimeout(() => {
      if (Number(digits) > 0 && !save.isPending) save.mutate();
    }, 900);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [digits, scan, mode, confirmRange]);

  const finish = useMutation({
    mutationFn: () =>
      finishRound(roundId!, {
        skips: (remainingQ.data?.remaining ?? [])
          .filter((a): a is typeof a & { id: string } => Boolean(skipDraft[a.id]))
          .map((a) => ({ animalId: a.id, reason: skipDraft[a.id]! })),
      }),
    onSuccess: () => {
      setFinishing(false);
      setScan(null);
      rememberActiveRound(null);
      void remainingQ.refetch();
      void qc.invalidateQueries({ queryKey: ['milk'] });
    },
  });

  const tank = useMutation({
    mutationFn: () => updateTank(remainingQ.data!.round.milkRoundId!, { actualLitres: Number(actual) }),
    onSuccess: () => void tankQ.refetch(),
  });

  const press = (ch: string) => {
    if (ch === 'C') {
      setDigits('');
      setConfirmRange(false);
      return;
    }
    if (ch === '.' && digits.includes('.')) return;
    if (digits.replace('.', '').length >= 4) return;
    typedRef.current = true;
    setDigits((d) => d + ch);
    setConfirmRange(false);
  };

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    const first = lookupHits[0];
    if (lookupHits.length === 1 && first) void openAnimal(first.id, 'MANUAL_NUMBER');
  };

  useEffect(() => {
    if (!roundId || remainingQ.data?.round.status === 'FINISHED') return;
    const el = cameraHostRef.current;
    if (!el) return;
    const scanner = new Html5Qrcode(el.id);
    scannerRef.current = scanner;
    void scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (text) => {
          const now = Date.now();
          if (now - lastScanAt.current < 1200) return;
          lastScanAt.current = now;
          const target = parseQrPayload(text);
          void openAnimal(target?.kind === 'animal' ? target.id : text, 'CAMERA');
        },
        () => undefined,
      )
      .then(async () => {
        try {
          await scanner.applyVideoConstraints({
            advanced: [{ torch: true }],
          } as unknown as MediaTrackConstraints);
        } catch {
          /* torch not available */
        }
      })
      .catch(() => undefined);
    return () => {
      void scanner.stop().catch(() => undefined);
      scannerRef.current = null;
    };
  }, [roundId, openAnimal, remainingQ.data?.round.status]);

  const cached = useMemo(() => readShedCache(), [cacheTick, remainingQ.data]);
  const remaining = remainingQ.data?.remaining ?? cached.remaining;
  const recorded = remainingQ.data?.recorded ?? cached.recorded ?? 0;
  const expected = remainingQ.data?.expected ?? cached.expected ?? remaining.length + recorded;
  const withhold = scan?.blocks.find((b) => b.kind === 'MILK_WITHHOLD');
  const padOpen = scan != null && mode !== 'BROWSE';
  const roundClosed = remainingQ.data?.round.status === 'FINISHED';

  const spokenUsual = useMemo(() => {
    const n = scan?.context.rolling7Mean;
    return n != null ? n.toFixed(1) : null;
  }, [scan]);

  return (
    <div className={`shed ${flash === 'ok' ? 'shed-flash-ok' : ''} ${flash === 'bad' ? 'shed-flash-bad' : ''}`}>
      <div className="shed-mode" data-session={session} data-mode={mode}>
        {t(`shed.mode.${mode}`)}
        {mode === 'MILKING' ? ` — ${t(`shed.session.${session}`)}` : ''}
        <span className="shed-count">{roundId ? `${recorded} / ${expected}` : '—'}</span>
      </div>

      {!roundId && (
        <div className="card shed-start">
          <h1>{t('shed.title')}</h1>
          <p className="muted">{t('shed.subtitle')}</p>
          <div className="shed-modes">
            {RECORDING_MODES.map((m) => (
              <button
                key={m}
                type="button"
                className={m === mode ? 'btn' : 'btn secondary'}
                onClick={() => setMode(m)}
              >
                {t(`shed.mode.${m}`)}
              </button>
            ))}
          </div>
          {mode === 'MILKING' && (
            <div className="shed-sessions">
              {SESSIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={s === session ? 'btn' : 'btn secondary'}
                  onClick={() => setSession(s)}
                >
                  {t(`shed.session.${s}`)}
                </button>
              ))}
            </div>
          )}
          {mode === 'VACCINATION' && (
            <div className="form-grid">
              <label>
                {t('shed.vaxDisease')}
                <select value={vaxDisease} onChange={(e) => setVaxDisease(e.target.value)}>
                  {NEPAL_VACCINE_PROTOCOLS.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.titleEn}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('health.medicine')}
                <select value={vaxItemId} onChange={(e) => setVaxItemId(e.target.value)}>
                  <option value="">—</option>
                  {(inventoryQ.data?.items ?? []).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <button type="button" className="btn shed-go" onClick={() => start.mutate()} disabled={start.isPending}>
            {t('shed.start')}
          </button>
        </div>
      )}

      {roundId && (
        <div id="shed-camera" ref={cameraHostRef} className={padOpen ? 'shed-camera shed-camera-docked' : 'shed-camera'} />
      )}

      {roundId && !padOpen && !roundClosed && !finishing && (
        <>
          <form className="shed-search" onSubmit={onSearch}>
            <input
              inputMode="numeric"
              autoFocus
              className="shed-search-input"
              placeholder={t('shed.typeNumber')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </form>
          <div className="shed-skip">
            {lastSaved && (
              <button
                type="button"
                className="btn secondary"
                onClick={() => void openAnimal(lastSaved.animalId, 'LIST_TAP')}
              >
                {t('shed.undo')}
              </button>
            )}
            <button type="button" className="btn secondary" onClick={() => setShowPhotos((v) => !v)}>
              {showPhotos ? t('shed.hidePhotos') : t('shed.photoGrid')}
            </button>
          </div>
          {lookupHits.map((a) => (
            <button key={a.id} type="button" className="shed-row" onClick={() => void openAnimal(a.id, 'MANUAL_NUMBER')}>
              {a.photoUrl ? <img src={a.photoUrl} alt="" className="shed-thumb" /> : <span className="shed-thumb shed-thumb-empty" />}
              <strong>{a.shortNo ?? a.tag}</strong>
              <span>
                {a.name ?? a.species}
                <em> {a.species}</em>
              </span>
              <em>{a.penName ?? ''}</em>
            </button>
          ))}
          <h2 className="shed-remaining-title">{t('shed.stillToDo')}</h2>
          {showPhotos ? (
            <div className="shed-photos">
              {remaining.map((a) => (
                <button key={a.id} type="button" className="shed-photo" onClick={() => void openAnimal(a.id, 'PHOTO_PICK')}>
                  {a.photoUrl ? <img src={a.photoUrl} alt="" /> : <span>{a.shortNo ?? a.tag}</span>}
                  <em>{a.shortNo ?? a.tag}</em>
                </button>
              ))}
            </div>
          ) : (
            remaining.map((a) => (
              <button key={a.id} type="button" className="shed-row" onClick={() => void openAnimal(a.id, 'LIST_TAP')}>
                {a.photoUrl ? <img src={a.photoUrl} alt="" className="shed-thumb" /> : <span className="shed-thumb shed-thumb-empty" />}
                <strong>{a.shortNo ?? a.tag}</strong>
                <span>
                  {a.name ?? ''}
                  {a.withholdActive ? ` · ${t('shed.withhold')}` : ''}
                </span>
                <em>{a.penName ?? ''}</em>
              </button>
            ))
          )}
          <button type="button" className="btn secondary shed-finish" onClick={() => (remaining.length ? setFinishing(true) : finish.mutate())}>
            {t('shed.finish')}
          </button>
        </>
      )}

      {padOpen && scan && (
        <div className="shed-pad-wrap">
          <p className="shed-who">
            <strong>{scan.animal.shortNo ?? scan.animal.name}</strong>
            <span>{scan.animal.name}</span>
            {scan.context.alreadyRecordedThisRound && (
              <em>{t('shed.alreadyRecordedValue', { n: scan.context.existingValue })}</em>
            )}
            {withhold && <em className="shed-hold">{t('shed.cannotSell')}</em>}
          </p>
          {mode === 'MILKING' && (
            <>
              <p className="shed-usual">
                {spokenUsual ? t('shed.usual', { n: spokenUsual }) : t('shed.noUsual')}
              </p>
              <div className="shed-display" data-placeholder={spokenUsual ?? '0.0'}>
                {digits || <span className="shed-placeholder">{spokenUsual ?? '0.0'}</span>}
              </div>
              <div className="shed-dest">
                {DISPOSALS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    disabled={!!withhold && d === 'SOLD'}
                    className={disposal === d ? 'btn' : 'btn secondary'}
                    onClick={() => setDisposal(d)}
                  >
                    {t(`shed.dest.${d}`)}
                  </button>
                ))}
              </div>
              <div className="shed-pad">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'C'].map((ch) => (
                  <button key={ch} type="button" onClick={() => press(ch)}>
                    {ch === 'C' ? t('shed.clear') : ch}
                  </button>
                ))}
              </div>
            </>
          )}
          {mode === 'WEIGHING' && (
            <>
              <div className="shed-display">{digits || '0.0'}</div>
              <div className="shed-pad">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'C'].map((ch) => (
                  <button key={ch} type="button" onClick={() => press(ch)}>
                    {ch === 'C' ? t('shed.clear') : ch}
                  </button>
                ))}
              </div>
            </>
          )}
          {mode !== 'MILKING' && mode !== 'WEIGHING' && (
            <p className="muted">{t(`shed.next.${scan.nextAction}`)}</p>
          )}
          {error && <p className="error-text">{error}</p>}
          {mode === 'VACCINATION' && (
            <button
              type="button"
              className="btn shed-save"
              onClick={() => confirmDose.mutate()}
              disabled={confirmDose.isPending}
            >
              {t('shed.confirmDose')}
            </button>
          )}
          {mode === 'MILKING' && (
            <button
              type="button"
              className="btn shed-save"
              onClick={() => save.mutate()}
              disabled={save.isPending || !digits}
            >
              {confirmRange ? t('shed.confirmSave') : t('shed.save')}
            </button>
          )}
          <div className="shed-skip">
            <button type="button" className="btn secondary" onClick={() => setScan(null)}>
              {t('shed.backToCamera')}
            </button>
          </div>
        </div>
      )}

      {finishing && (
        <div className="card shed-finish-sheet">
          <h2>{t('shed.unrecordedTitle', { n: remaining.length })}</h2>
          {remaining.map((a) => (
            <div key={a.id} className="shed-finish-row">
              <strong>{a.shortNo ?? a.tag}</strong>
              <span>{a.name}</span>
              <div className="shed-skip">
                {SKIP_REASONS.map((reason) => (
                  <button
                    key={reason}
                    type="button"
                    className={skipDraft[a.id] === reason ? 'btn' : 'btn secondary'}
                    onClick={() => setSkipDraft((d) => ({ ...d, [a.id]: reason }))}
                  >
                    {t(`shed.skip.${reason}`)}
                  </button>
                ))}
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => {
                    setFinishing(false);
                    void openAnimal(a.id, 'LIST_TAP');
                  }}
                >
                  {t('shed.recordNow')}
                </button>
              </div>
            </div>
          ))}
          <button type="button" className="btn shed-finish" onClick={() => finish.mutate()} disabled={finish.isPending}>
            {t('shed.confirmFinish')}
          </button>
        </div>
      )}

      {roundClosed && tankQ.data && (
        <div className="card">
          <h2>{t('shed.tank')}</h2>
          {remainingQ.data?.round.secondsPerAnimal != null && (
            <p>
              {t('shed.secondsPerAnimal', { n: remainingQ.data.round.secondsPerAnimal.toFixed(1) })}
            </p>
          )}
          <p>
            {t('shed.expected')}: <strong>{tankQ.data.expected.toFixed(1)} L</strong>
          </p>
          {tankQ.data.tank?.actualLitres != null && (
            <p>
              {t('shed.actual')}: {tankQ.data.tank.actualLitres.toFixed(1)} L · {t('shed.variance')}:{' '}
              {tankQ.data.tank.variancePercent?.toFixed(1)}%
            </p>
          )}
          <form
            className="form-grid"
            onSubmit={(e) => {
              e.preventDefault();
              tank.mutate();
            }}
          >
            <label>
              {t('shed.actual')}
              <input type="number" step="0.1" value={actual} onChange={(e) => setActual(e.target.value)} required />
            </label>
            <button type="submit" className="btn">
              {t('shed.saveTank')}
            </button>
          </form>
          <p className="muted">{t('shed.varianceHint')}</p>
        </div>
      )}
    </div>
  );
}
