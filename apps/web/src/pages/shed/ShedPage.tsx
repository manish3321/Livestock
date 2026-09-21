import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Html5Qrcode } from 'html5-qrcode';
import type { MilkSession, RecordingMode, RoundSkipReason } from '@farm/contracts';
import { NEPAL_VACCINE_PROTOCOLS, RECORDING_MODES } from '@farm/contracts';
import { batchVaccinate } from '../../api/health';
import { listInventory } from '../../api/inventory';
import { ApiRequestError } from '../../api/client';
import { api } from '../../api/client';
import { getMilkRound, recordDelivery, updateTank, uploadDeliveryReceipt } from '../../api/milk';
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
import { isShedMilkDeepLink, shedModeFromParams } from '../../lib/shed-deeplink';
import { shedFeedback } from '../../lib/shed-feedback';
import { matchRosterByQuery, optimisticScanFromRoster } from '../../lib/shed-scan';
import { useScanOverlay } from '../../components/ScanAnywhere';
import {
  cacheScan,
  cachedScan,
  clearCachedScan,
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

/** Shed OS: roster-first milking; camera is opt-in. */
export function ShedPage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { open: scanOverlayOpen } = useScanOverlay();
  const [params] = useSearchParams();
  const milkDeepLink = isShedMilkDeepLink(params);
  const farmQ = useQuery({
    queryKey: ['farm-me'],
    queryFn: () =>
      api<{ morningMilkingHour: number; eveningMilkingHour: number }>('/v1/farms/me'),
  });

  const [mode, setMode] = useState<RecordingMode>(() => shedModeFromParams(params));
  const [session, setSession] = useState<MilkSession>(() => defaultSession(5, 17));
  const [roundId, setRoundId] = useState<string | null>(null);
  const [activeRoundReady, setActiveRoundReady] = useState(false);
  const [deepLinkBootError, setDeepLinkBootError] = useState<string | null>(null);
  const [scan, setScan] = useState<ScanResolveDto | null>(null);
  const [digits, setDigits] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
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
  const [litresSent, setLitresSent] = useState('');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [showPhotos, setShowPhotos] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [destOpen, setDestOpen] = useState(false);
  const [vaxItemId, setVaxItemId] = useState('');
  const [vaxDisease, setVaxDisease] = useState('FMD');
  const [cacheTick, setCacheTick] = useState(0);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScanAt = useRef(0);
  const cameraHostRef = useRef<HTMLDivElement | null>(null);
  const typedRef = useRef(false);
  const openedPreset = useRef(false);
  const autoStartedRef = useRef(false);
  const openSeq = useRef(0);
  const scanAnimalIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (farmQ.data && !roundId) {
      setSession(defaultSession(farmQ.data.morningMilkingHour, farmQ.data.eveningMilkingHour));
    }
  }, [farmQ.data, roundId]);

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
    let cancelled = false;
    const markReady = () => {
      if (!cancelled) setActiveRoundReady(true);
    };
    const onOnline = () => void flushShedQueue().then(() => void remainingQ.refetch());
    window.addEventListener('online', onOnline);
    if (navigator.onLine) {
      void getActiveRound()
        .then((active) => {
          if (cancelled) return;
          if (active) {
            setRoundId(active.id);
            setMode(active.mode);
            if (active.session) setSession(active.session);
            rememberActiveRound(active.id, active.mode, active.session);
          }
        })
        .catch(() => {
          /* offline resume below if needed */
        })
        .finally(markReady);
    } else {
      const cached = readActiveRound();
      if (cached) {
        setRoundId(cached.id);
        if (cached.mode) setMode(cached.mode as RecordingMode);
        if (cached.session) setSession(cached.session as MilkSession);
      }
      markReady();
    }
    return () => {
      cancelled = true;
      window.removeEventListener('online', onOnline);
    };
  }, []);

  const inventoryQ = useQuery({
    queryKey: ['inventory', 'shed-vax'],
    queryFn: () => listInventory({ pageSize: 100 }),
    enabled: mode === 'VACCINATION' || mode === 'TREATMENT',
  });

  // The shed flow has its own sound, flash, and inline error text; toasts would double up.
  const start = useMutation({
    meta: { silent: true },
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
      setDeepLinkBootError(null);
    },
  });

  /** Scan → Milk already identified the animal: join/resume a milking round and open the pad. */
  useEffect(() => {
    if (!milkDeepLink || !activeRoundReady || roundId || autoStartedRef.current) return;
    if (farmQ.isLoading) return;
    autoStartedRef.current = true;
    setMode('MILKING');
    setDeepLinkBootError(null);
    const bootSession = farmQ.data
      ? defaultSession(farmQ.data.morningMilkingHour, farmQ.data.eveningMilkingHour)
      : session;
    setSession(bootSession);
    void startRound({ mode: 'MILKING', session: bootSession })
      .then((r) => {
        setRoundId(r.id);
        setMode(r.mode);
        if (r.session) setSession(r.session);
        rememberActiveRound(r.id, r.mode, r.session);
      })
      .catch((err) => {
        autoStartedRef.current = false;
        if (err instanceof ApiRequestError) setDeepLinkBootError(err.error.message);
        else setDeepLinkBootError(t('shed.saveFailed'));
      });
    // session intentionally omitted — bootSession is derived once farm hours are ready
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deep-link boot once per mount
  }, [milkDeepLink, activeRoundReady, roundId, farmQ.isLoading, farmQ.data, t]);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedSearch(search.trim()), 200);
    return () => window.clearTimeout(handle);
  }, [search]);

  const cached = useMemo(() => readShedCache(), [cacheTick, remainingQ.data]);
  const remaining = remainingQ.data?.remaining ?? cached.remaining;
  const recorded = remainingQ.data?.recorded ?? cached.recorded ?? 0;
  const expected = remainingQ.data?.expected ?? cached.expected ?? remaining.length + recorded;

  const localHits = useMemo(() => matchRosterByQuery(remaining, search), [remaining, search]);

  const lookupQ = useQuery({
    queryKey: ['animal-search', debouncedSearch],
    queryFn: () => searchAnimals(debouncedSearch),
    enabled:
      debouncedSearch.length >= 1 &&
      !scan &&
      navigator.onLine &&
      localHits.length === 0,
  });
  const remoteHits = navigator.onLine ? (lookupQ.data ?? []) : [];
  const offlineHits = !navigator.onLine ? resolveCachedByNumber(search) : [];
  const lookupHits = localHits.length > 0 ? localHits : remoteHits.length > 0 ? remoteHits : offlineHits;

  const applyScanDto = useCallback((dto: ScanResolveDto) => {
    scanAnimalIdRef.current = dto.animal.id;
    setScan(dto);
    typedRef.current = false;
    setDigits(
      dto.context.alreadyRecordedThisRound && dto.context.existingValue != null
        ? String(dto.context.existingValue)
        : '',
    );
    setConfirmRange(false);
    setError(null);
    setDisposal(dto.blocks.some((b) => b.kind === 'MILK_WITHHOLD') ? 'DISCARDED' : 'SOLD');
    setDestOpen(false);
    setCameraOpen(false);
    setSearch('');
  }, []);

  const openAnimal = useCallback(
    async (raw: string, method: ScanCreateMethod) => {
      const parsed = parseQrPayload(raw);
      const idHint = parsed?.kind === 'animal' ? parsed.id : raw;
      const rosterHit =
        remaining.find((a) => a.id === idHint) ??
        matchRosterByQuery(remaining, raw)[0] ??
        cached.remaining.find((a) => a.id === idHint) ??
        matchRosterByQuery(cached.remaining, raw)[0];
      const searchHit = remoteHits.find((a) => a.id === idHint);
      let fromCache = cachedScan(idHint) ?? (rosterHit ? cachedScan(rosterHit.id) : undefined);
      // Still on the to-do list ⇒ not milked this round. Drop stale "already recorded" cache.
      if (fromCache?.context.alreadyRecordedThisRound && rosterHit) {
        clearCachedScan(fromCache.animal.id);
        fromCache = undefined;
      }

      const seq = ++openSeq.current;

      if (fromCache) {
        applyScanDto(fromCache);
      } else if (rosterHit) {
        applyScanDto(optimisticScanFromRoster(rosterHit, mode));
      } else if (searchHit) {
        applyScanDto(
          optimisticScanFromRoster(
            {
              id: searchHit.id,
              shortNo: searchHit.shortNo,
              name: searchHit.name,
              species: searchHit.species,
              penName: searchHit.penName,
              photoUrl: searchHit.photoUrl,
              status: searchHit.status,
              isPregnant: false,
              withholdActive: false,
              usualLitres: null,
            },
            mode,
          ),
        );
      }

      const offline = fromCache && !navigator.onLine ? fromCache : undefined;
      try {
        const dto =
          offline ??
          (await postScan({ rawPayload: raw, method, roundId: roundId ?? undefined }));
        cacheScan(dto);
        if (seq !== openSeq.current) return;
        if (dto.nextAction === 'PROFILE') {
          navigate(`/animals/${dto.animal.id}`);
          return;
        }
        if (!fromCache && !rosterHit && !searchHit) {
          applyScanDto(dto);
        } else if (scanAnimalIdRef.current === dto.animal.id) {
          setScan((prev) => {
            if (!prev || prev.animal.id !== dto.animal.id) return dto;
            // Keep digits the milker already typed; merge server ids/withhold/usual.
            return {
              ...dto,
              context: {
                ...dto.context,
                // If they already typed, don't clobber with existingValue unless correcting.
                existingEntryId: dto.context.existingEntryId ?? prev.context.existingEntryId,
              },
            };
          });
          if (dto.context.alreadyRecordedThisRound && dto.context.existingValue != null && !typedRef.current) {
            setDigits(String(dto.context.existingValue));
          }
          if (dto.blocks.some((b) => b.kind === 'MILK_WITHHOLD')) {
            setDisposal('DISCARDED');
          }
        }
      } catch (err) {
        if (seq !== openSeq.current) return;
        if (!fromCache && !rosterHit && !searchHit) {
          shedFeedback('bad');
          setFlash('bad');
          setTimeout(() => setFlash(null), 700);
          if (err instanceof ApiRequestError) setError(err.error.message);
        }
      }
    },
    [applyScanDto, cached.remaining, mode, navigate, remaining, remoteHits, roundId],
  );

  useEffect(() => {
    const preset = params.get('animal');
    if (preset && roundId && !openedPreset.current) {
      openedPreset.current = true;
      void openAnimal(preset, 'LIST_TAP');
    }
  }, [params, roundId, openAnimal]);

  const save = useMutation({
    meta: { silent: true },
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
      const animalId = scan!.animal.id;
      shedFeedback(
        'ok',
        i18n.language === 'ne' ? `${qty.replace('.', ' दशमलव ')}, ${name}` : undefined,
      );
      const entryId = 'id' in result ? result.id : scan?.context.existingEntryId ?? null;
      setLastSaved({
        animalId,
        litres: qty,
        entryId,
      });
      setDigits('');
      setConfirmRange(false);
      setError(null);
      setFlash('ok');
      setTimeout(() => setFlash(null), 400);
      setScan(null);
      scanAnimalIdRef.current = null;
      const next = readShedCache();
      const prevScan = next.scans[animalId];
      if (prevScan && entryId) {
        next.scans[animalId] = {
          ...prevScan,
          context: {
            ...prevScan.context,
            alreadyRecordedThisRound: true,
            existingValue: Number(qty),
            existingEntryId: entryId,
          },
        };
      }
      writeShedCache({
        ...next,
        remaining: next.remaining.filter((a) => a.id !== animalId),
        recorded: (next.recorded ?? 0) + 1,
      });
      setCacheTick((n) => n + 1);
      void remainingQ.refetch();
      void qc.invalidateQueries({ queryKey: ['round-remaining', roundId] });
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
          const details = err.error.details as { id?: string; litres?: number } | undefined;
          if (details?.id && scan) {
            setScan({
              ...scan,
              context: {
                ...scan.context,
                alreadyRecordedThisRound: true,
                existingEntryId: details.id,
                existingValue: details.litres ?? scan.context.existingValue,
              },
            });
            setError(t('shed.alreadyRecordedValue', { n: details.litres ?? digits }));
            return;
          }
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
    meta: { silent: true },
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

  // Save only on explicit tap — autosave made the pad feel laggy over the network.

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

  const delivery = useMutation({
    mutationFn: async () => {
      const id = remainingQ.data!.round.milkRoundId!;
      await recordDelivery(id, {
        litresSent: Number(litresSent),
        receiptNumber: receiptNumber || undefined,
      });
      if (receiptFile) await uploadDeliveryReceipt(id, receiptFile);
    },
    onSuccess: () => {
      setReceiptFile(null);
      void tankQ.refetch();
    },
  });

  const press = (ch: string) => {
    if (ch === 'C') {
      setDigits('');
      setConfirmRange(false);
      return;
    }
    if (ch === '⌫') {
      typedRef.current = true;
      setDigits((d) => d.slice(0, -1));
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
    if (scanOverlayOpen || !cameraOpen) return;
    if (!roundId || remainingQ.data?.round.status === 'FINISHED') return;

    let cancelled = false;
    const config = { fps: 10, qrbox: { width: 220, height: 220 } };
    const onDecoded = (text: string) => {
      const now = Date.now();
      if (now - lastScanAt.current < 1200) return;
      lastScanAt.current = now;
      const target = parseQrPayload(text);
      void openAnimal(target?.kind === 'animal' ? target.id : text, 'CAMERA');
    };

    const startScanner = async () => {
      const el = cameraHostRef.current;
      if (!el || cancelled) return;
      setCameraError(null);
      const scanner = new Html5Qrcode(el.id);
      scannerRef.current = scanner;

      const tryStart = async (cameraIdOrConfig: string | MediaTrackConstraints) => {
        await scanner.start(cameraIdOrConfig, config, onDecoded, () => undefined);
      };

      try {
        try {
          await tryStart({ facingMode: 'environment' });
        } catch {
          try {
            await tryStart({ facingMode: 'user' });
          } catch {
            const cams = await Html5Qrcode.getCameras();
            const first = cams[0]?.id;
            if (!first) throw new Error('no-camera');
            await tryStart(first);
          }
        }
        if (cancelled) {
          await scanner.stop().catch(() => undefined);
          return;
        }
        try {
          await scanner.applyVideoConstraints({
            advanced: [{ torch: true }],
          } as unknown as MediaTrackConstraints);
        } catch {
          /* torch not available on most devices */
        }
      } catch {
        if (cancelled) return;
        scannerRef.current = null;
        try {
          scanner.clear();
        } catch {
          /* ignore */
        }
        setCameraError(t('shed.cameraFailed'));
        setCameraOpen(false);
      }
    };

    const frame = requestAnimationFrame(() => {
      void startScanner();
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      const scanner = scannerRef.current;
      scannerRef.current = null;
      if (scanner) {
        void scanner
          .stop()
          .catch(() => undefined)
          .finally(() => {
            try {
              scanner.clear();
            } catch {
              /* ignore */
            }
          });
      }
    };
  }, [roundId, openAnimal, remainingQ.data?.round.status, scanOverlayOpen, cameraOpen, t]);

  const withhold = scan?.blocks.find((b) => b.kind === 'MILK_WITHHOLD');
  const padOpen = scan != null && mode !== 'BROWSE';
  const roundClosed = remainingQ.data?.round.status === 'FINISHED';

  const spokenUsual = useMemo(() => {
    const n = scan?.context.rolling7Mean;
    return n != null ? n.toFixed(1) : null;
  }, [scan]);

  const progressPct = expected > 0 ? Math.min(100, Math.round((recorded / expected) * 100)) : 0;
  const leftCount = remaining.length;
  const rosterView = search.trim() ? localHits : remaining;
  const remoteOnlyHits =
    search.trim() && localHits.length === 0
      ? remoteHits.filter((h) => !remaining.some((r) => r.id === h.id))
      : [];

  return (
    <div className={`shed ${flash === 'ok' ? 'shed-flash-ok' : ''} ${flash === 'bad' ? 'shed-flash-bad' : ''}`}>
      <div className="shed-mode" data-session={session} data-mode={mode}>
        <span>
          {t(`shed.mode.${mode}`)}
          {mode === 'MILKING' ? ` — ${t(`shed.session.${session}`)}` : ''}
        </span>
        <span className="shed-count">{roundId ? `${recorded} / ${expected}` : '—'}</span>
      </div>

      {!roundId && !milkDeepLink && (
        <div className="card shed-start">
          <h1>{t('shed.title')}</h1>
          <p className="muted">{t('shed.subtitle')}</p>
          <p className="shed-extra-links">
            <Link to="/shed/cohort">{t('nav.cohort')}</Link>
            {' · '}
            <Link to="/shed/sheet">{t('nav.dailySheet')}</Link>
          </p>
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

      {!roundId && milkDeepLink && (
        <div className="card shed-start">
          <h1>{t('shed.title')}</h1>
          <p className="muted">{t('shed.openingPad')}</p>
          {deepLinkBootError && (
            <>
              <p className="error">{deepLinkBootError}</p>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setDeepLinkBootError(null);
                  autoStartedRef.current = true;
                  const bootSession = farmQ.data
                    ? defaultSession(farmQ.data.morningMilkingHour, farmQ.data.eveningMilkingHour)
                    : session;
                  void startRound({ mode: 'MILKING', session: bootSession })
                    .then((r) => {
                      setRoundId(r.id);
                      setMode(r.mode);
                      if (r.session) setSession(r.session);
                      rememberActiveRound(r.id, r.mode, r.session);
                    })
                    .catch((err) => {
                      autoStartedRef.current = false;
                      if (err instanceof ApiRequestError) setDeepLinkBootError(err.error.message);
                      else setDeepLinkBootError(t('shed.saveFailed'));
                    });
                }}
              >
                {t('shed.start')}
              </button>
            </>
          )}
        </div>
      )}

      {roundId && !padOpen && !roundClosed && !finishing && (
        <div className="shed-roster">
          <div className="shed-progress" aria-label={t('shed.progressLabel', { done: recorded, total: expected })}>
            <div className="shed-progress-track">
              <div className="shed-progress-fill" style={{ width: `${progressPct}%` }} />
            </div>
            <div className="shed-progress-meta">
              <span className="shed-chip shed-chip-done">{t('shed.doneCount', { n: recorded })}</span>
              <span className={`shed-chip shed-chip-left${leftCount > 0 ? '' : ' shed-chip-clear'}`}>
                {t('shed.leftCount', { n: leftCount })}
              </span>
            </div>
          </div>

          <div className="shed-legend" aria-hidden="true">
            <span className="shed-legend-item shed-legend-next">{t('shed.legendNext')}</span>
            <span className="shed-legend-item shed-legend-todo">{t('shed.legendTodo')}</span>
            <span className="shed-legend-item shed-legend-hold">{t('shed.legendHold')}</span>
          </div>

          <form className="shed-search" onSubmit={onSearch}>
            <input
              inputMode="numeric"
              autoFocus
              className="shed-search-input"
              placeholder={t('shed.typeNumber')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label={t('shed.typeNumber')}
            />
          </form>

          <div className="shed-toolbar">
            <button
              type="button"
              className={cameraOpen ? 'btn' : 'btn secondary'}
              onClick={() => {
                setCameraError(null);
                setCameraOpen((v) => !v);
              }}
            >
              {cameraOpen ? t('shed.cameraOff') : t('shed.cameraOn')}
            </button>
            <button type="button" className="btn secondary" onClick={() => setShowPhotos((v) => !v)}>
              {showPhotos ? t('shed.hidePhotos') : t('shed.photoGrid')}
            </button>
            {lastSaved && (
              <button
                type="button"
                className="btn secondary"
                onClick={() => void openAnimal(lastSaved.animalId, 'LIST_TAP')}
              >
                {t('shed.undo')}
              </button>
            )}
          </div>

          {cameraError && !cameraOpen && <p className="error shed-camera-error">{cameraError}</p>}

          {cameraOpen && (
            <div className="shed-camera-panel">
              <p className="shed-camera-hint muted">{t('shed.cameraHint')}</p>
              <div id="shed-camera" ref={cameraHostRef} className="shed-camera" />
            </div>
          )}

          {remoteOnlyHits.map((a) => (
            <button
              key={a.id}
              type="button"
              className="shed-row shed-row-hit"
              onClick={() => void openAnimal(a.id, 'MANUAL_NUMBER')}
            >
              {a.photoUrl ? <img src={a.photoUrl} alt="" className="shed-thumb" /> : <span className="shed-thumb shed-thumb-empty" />}
              <span className="shed-row-body">
                <strong>{a.shortNo ?? a.tag}</strong>
                <span>
                  {a.name ?? a.species}
                  <em> {a.species}</em>
                </span>
              </span>
              <em className="shed-row-pen">{a.penName ?? ''}</em>
            </button>
          ))}

          <h2 className="shed-remaining-title">
            {t('shed.stillToDo')}
            {leftCount > 0 && <span className="shed-remaining-badge">{leftCount}</span>}
          </h2>

          {leftCount === 0 ? (
            <p className="shed-all-done">{t('shed.allDone')}</p>
          ) : showPhotos ? (
            <div className="shed-photos">
              {rosterView.map((a, index) => (
                <button
                  key={a.id}
                  type="button"
                  className={`shed-photo${index === 0 ? ' shed-photo-next' : ''}${'withholdActive' in a && a.withholdActive ? ' shed-photo-hold' : ''}`}
                  onClick={() => void openAnimal(a.id, 'PHOTO_PICK')}
                >
                  {a.photoUrl ? <img src={a.photoUrl} alt="" /> : <span>{a.shortNo ?? a.tag}</span>}
                  <em>{a.shortNo ?? a.tag}</em>
                </button>
              ))}
            </div>
          ) : (
            rosterView.map((a, index) => (
              <button
                key={a.id}
                type="button"
                className={`shed-row shed-row-todo${index === 0 ? ' shed-row-next' : ''}${'withholdActive' in a && a.withholdActive ? ' shed-row-hold' : ''}`}
                onClick={() => void openAnimal(a.id, 'LIST_TAP')}
              >
                <span className="shed-row-stripe" aria-hidden="true" />
                {a.photoUrl ? <img src={a.photoUrl} alt="" className="shed-thumb" /> : <span className="shed-thumb shed-thumb-empty">{a.shortNo ?? a.tag}</span>}
                <span className="shed-row-body">
                  <strong>{a.shortNo ?? a.tag}</strong>
                  <span>
                    {a.name ?? ''}
                    {'withholdActive' in a && a.withholdActive ? ` · ${t('shed.withhold')}` : ''}
                  </span>
                </span>
                <em className="shed-row-pen">{a.penName ?? ''}</em>
              </button>
            ))
          )}

          <button
            type="button"
            className={`btn shed-finish${leftCount > 0 ? ' shed-finish-warn' : ''}`}
            onClick={() => (remaining.length ? setFinishing(true) : finish.mutate())}
          >
            {leftCount > 0 ? t('shed.finishWithLeft', { n: leftCount }) : t('shed.finish')}
          </button>
        </div>
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
              <div className="shed-display-row">
                <div className="shed-display" data-placeholder={spokenUsual ?? '0.0'}>
                  {digits || <span className="shed-placeholder">{spokenUsual ?? '0.0'}</span>}
                </div>
                <button type="button" className="btn secondary shed-clr" onClick={() => press('C')}>
                  {t('shed.clear')}
                </button>
              </div>
              <div className="shed-dest-bar">
                <span className={`shed-dest-current shed-dest-${disposal}`}>{t(`shed.dest.${disposal}`)}</span>
                <button type="button" className="btn secondary shed-dest-toggle" onClick={() => setDestOpen((v) => !v)}>
                  {destOpen ? t('shed.hideDest') : t('shed.changeDest')}
                </button>
              </div>
              {destOpen && (
                <div className="shed-dest">
                  {DISPOSALS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      disabled={!!withhold && d === 'SOLD'}
                      className={`shed-dest-btn shed-dest-${d}${disposal === d ? ' is-active' : ''}`}
                      onClick={() => {
                        setDisposal(d);
                        setDestOpen(false);
                      }}
                    >
                      {t(`shed.dest.${d}`)}
                    </button>
                  ))}
                </div>
              )}
              <div className="shed-pad">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'].map((ch) => (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => press(ch)}
                    aria-label={ch === '⌫' ? t('shed.backspace') : undefined}
                  >
                    {ch}
                  </button>
                ))}
              </div>
            </>
          )}
          {mode === 'WEIGHING' && (
            <>
              <div className="shed-display-row">
                <div className="shed-display">{digits || '0.0'}</div>
                <button type="button" className="btn secondary shed-clr" onClick={() => press('C')}>
                  {t('shed.clear')}
                </button>
              </div>
              <div className="shed-pad">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'].map((ch) => (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => press(ch)}
                    aria-label={ch === '⌫' ? t('shed.backspace') : undefined}
                  >
                    {ch}
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
              {t('shed.backToList')}
            </button>
          </div>
        </div>
      )}

      {finishing && (
        <div className="card shed-finish-sheet">
          <h2>{t('shed.unrecordedTitle', { n: remaining.length })}</h2>
          <p className="muted">{t('shed.unrecordedHint')}</p>
          {remaining.map((a) => (
            <div key={a.id} className={`shed-finish-row${a.withholdActive ? ' shed-finish-hold' : ''}`}>
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
          <h3>{t('shed.delivery')}</h3>
          {tankQ.data.tank?.delivery?.receiptUrl && <p>{t('shed.receiptReady')}</p>}
          <form
            className="form-grid"
            onSubmit={(e) => {
              e.preventDefault();
              delivery.mutate();
            }}
          >
            <label>
              {t('shed.litresSent')}
              <input
                type="number"
                step="0.1"
                value={litresSent}
                onChange={(e) => setLitresSent(e.target.value)}
                required
              />
            </label>
            <label>
              {t('shed.receiptNumber')}
              <input value={receiptNumber} onChange={(e) => setReceiptNumber(e.target.value)} />
            </label>
            <label>
              {t('shed.receiptPhoto')}
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <button type="submit" className="btn" disabled={delivery.isPending}>
              {t('shed.saveDelivery')}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
