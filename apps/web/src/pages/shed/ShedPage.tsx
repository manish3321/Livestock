import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Html5Qrcode } from 'html5-qrcode';
import type { MilkDestination, MilkRoundDto, MilkSession, ScanMode } from '@farm/contracts';
import { SCAN_MODES } from '@farm/contracts';
import { ApiRequestError } from '../../api/client';
import {
  finishMilkRound,
  lookupHerd,
  recordMilk,
  skipMilk,
  startMilkRound,
  updateTank,
} from '../../api/milk';
import { parseQrPayload } from '../../lib/qr';
import { shedFeedback } from '../../lib/shed-feedback';

const SESSIONS: MilkSession[] = ['MORNING', 'EVENING', 'MIDDAY'];
const DESTINATIONS: MilkDestination[] = ['SOLD', 'CALF', 'HOUSEHOLD', 'DISCARDED'];

function defaultSession(): MilkSession {
  const hour = new Date().getHours();
  if (hour < 10) return 'MORNING';
  if (hour >= 15) return 'EVENING';
  return 'MIDDAY';
}

/** Shed OS: one mode, a keypad, a remaining list. Not a profile page. */
export function ShedPage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<ScanMode>('MILKING');
  const [session, setSession] = useState<MilkSession>(defaultSession);
  const [round, setRound] = useState<MilkRoundDto | null>(null);
  const [activeId, setActiveId] = useState<string | null>(params.get('animal'));
  const [cameraOn, setCameraOn] = useState(false);
  const [lastSaved, setLastSaved] = useState<{ id: string; qty: string } | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [digits, setDigits] = useState('');
  const [search, setSearch] = useState('');
  const [destination, setDestination] = useState<MilkDestination>('SOLD');
  const [confirmRange, setConfirmRange] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<'ok' | 'bad' | null>(null);
  const [actual, setActual] = useState('');

  const start = useMutation({
    mutationFn: () => startMilkRound({ session }),
    onSuccess: (r) => {
      setRound(r);
      setError(null);
    },
  });

  const lookupQ = useQuery({
    queryKey: ['herd-lookup', search],
    queryFn: () => lookupHerd(search),
    enabled: search.trim().length >= 1 && !activeId,
  });

  const record = useMutation({
    mutationFn: async () => {
      if (!round || !activeId) throw new Error('no round');
      const qty = Number(digits);
      if (!Number.isFinite(qty) || qty <= 0) throw new Error('qty');
      return recordMilk(round.id, {
        animalId: activeId,
        quantity: qty,
        destination,
        confirmOutOfRange: confirmRange,
      });
    },
    onSuccess: (r) => {
      setRound(r);
      setLastSaved({ id: activeId!, qty: digits });
      const who = r.recordedAnimals.find((a) => a.id === activeId);
      shedFeedback(
        'ok',
        i18n.language === 'ne'
          ? `${digits.replace('.', ' दशमलव ')}, ${who?.name ?? who?.herdNumber ?? ''}`
          : undefined,
      );
      setDigits('');
      setConfirmRange(false);
      setError(null);
      setFlash('ok');
      setTimeout(() => setFlash(null), 400);
      setActiveId(null);
      setSearch('');
      setDestination('SOLD');
    },
    onError: (err) => {
      setFlash('bad');
      shedFeedback('bad');
      setTimeout(() => setFlash(null), 700);
      if (err instanceof ApiRequestError) {
        if (err.error.code === 'YIELD_OUT_OF_RANGE') {
          setConfirmRange(true);
        }
        setError(err.error.message);
      } else {
        setError(t('shed.saveFailed'));
      }
    },
  });

  const skip = useMutation({
    mutationFn: (reason: 'NOT_MILKED' | 'FORGOT') => {
      if (!round || !activeId) throw new Error('no round');
      return skipMilk(round.id, { animalId: activeId, reason });
    },
    onSuccess: (r) => {
      setRound(r);
      setActiveId(null);
      setDigits('');
    },
  });

  const finish = useMutation({
    mutationFn: () => finishMilkRound(round!.id),
    onSuccess: (r) => setRound(r),
  });

  const tank = useMutation({
    mutationFn: () => updateTank(round!.id, { actualLitres: Number(actual) }),
    onSuccess: (r) => {
      setRound(r);
      void qc.invalidateQueries({ queryKey: ['milk'] });
    },
  });

  const active = useMemo(() => {
    if (!round || !activeId) return null;
    return (
      round.remaining.find((a) => a.id === activeId) ??
      round.recordedAnimals.find((a) => a.id === activeId) ??
      null
    );
  }, [round, activeId]);

  const press = (ch: string) => {
    if (ch === 'C') {
      setDigits('');
      return;
    }
    if (ch === '.' && digits.includes('.')) return;
    if (digits.replace('.', '').length >= 4) return;
    setDigits((d) => d + ch);
  };

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    const first = lookupQ.data?.[0];
    if (first) setActiveId(first.id);
  };

  useEffect(() => {
    if (!cameraOn) return;
    const elId = 'shed-camera';
    if (!document.getElementById(elId)) return;
    const scanner = new Html5Qrcode(elId);
    scannerRef.current = scanner;
    void scanner
      .start(
        { facingMode: 'environment' },
        { fps: 8, qrbox: { width: 220, height: 220 } },
        (text) => {
          const target = parseQrPayload(text);
          if (target?.kind === 'animal') setActiveId(target.id);
        },
        () => undefined,
      )
      .catch(() => setCameraOn(false));
    return () => {
      void scanner.stop().catch(() => undefined);
      scannerRef.current = null;
    };
  }, [cameraOn]);

  return (
    <div className={`shed ${flash === 'ok' ? 'shed-flash-ok' : ''} ${flash === 'bad' ? 'shed-flash-bad' : ''}`}>
      <div className="shed-mode" data-session={session} data-mode={mode}>
        {t(`shed.mode.${mode}`)} — {t(`shed.session.${session}`)}
        <span className="shed-count">
          {round ? `${round.recorded} / ${round.recorded + round.remaining.length}` : '—'}
        </span>
      </div>
      <div className="shed-modes">
        {SCAN_MODES.map((m) => (
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

      {!round && (
        <div className="card shed-start">
          <h1>{t('shed.title')}</h1>
          <p className="muted">{t('shed.subtitle')}</p>
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
          <button type="button" className="btn shed-go" onClick={() => start.mutate()} disabled={start.isPending}>
            {t('shed.start')}
          </button>
        </div>
      )}

      {round && !active && round.status === 'OPEN' && (
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
            <button type="button" className="btn secondary" onClick={() => setCameraOn((v) => !v)}>
              {cameraOn ? t('shed.cameraOff') : t('shed.cameraOn')}
            </button>
            {lastSaved && (
              <button
                type="button"
                className="btn secondary"
                onClick={() => {
                  setActiveId(lastSaved.id);
                  setDigits(lastSaved.qty);
                }}
              >
                {t('shed.undo')}
              </button>
            )}
          </div>
          {cameraOn && <div id="shed-camera" className="shed-camera" />}
          {(lookupQ.data ?? []).map((a) => (
            <button key={a.id} type="button" className="shed-row" onClick={() => setActiveId(a.id)}>
              <strong>{a.herdNumber ?? a.tag}</strong>
              <span>{a.name ?? a.species}</span>
              <em>{a.shed ?? ''}</em>
            </button>
          ))}
          <h2 className="shed-remaining-title">{t('shed.stillToDo')}</h2>
          {round.remaining.map((a) => (
            <button key={a.id} type="button" className="shed-row" onClick={() => setActiveId(a.id)}>
              <strong>{a.herdNumber ?? a.tag}</strong>
              <span>
                {a.name ?? ''}
                {a.withholdActive ? ` · ${t('shed.withhold')}` : ''}
              </span>
              <em>{a.shed ?? ''}</em>
            </button>
          ))}
          <button type="button" className="btn secondary shed-finish" onClick={() => finish.mutate()}>
            {t('shed.finish')}
          </button>
        </>
      )}

      {round && active && (
        <div className="shed-pad-wrap">
          <p className="shed-who">
            <strong>{active.herdNumber ?? active.tag}</strong>
            <span>{active.name}</span>
            {active.withholdActive && <em className="shed-hold">{t('shed.cannotSell')}</em>}
          </p>
          <p className="shed-usual">
            {active.usualLitres != null
              ? t('shed.usual', { n: active.usualLitres.toFixed(1) })
              : t('shed.noUsual')}
          </p>
          <div className="shed-display">{digits || (active.usualLitres?.toFixed(1) ?? '0.0')}</div>
          <div className="shed-dest">
            {DESTINATIONS.map((d) => (
              <button
                key={d}
                type="button"
                disabled={active.withholdActive && d === 'SOLD'}
                className={destination === d ? 'btn' : 'btn secondary'}
                onClick={() => setDestination(d)}
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
          {error && <p className="error-text">{error}</p>}
          <button
            type="button"
            className="btn shed-save"
            onClick={() => record.mutate()}
            disabled={record.isPending || !digits}
          >
            {confirmRange ? t('shed.confirmSave') : t('shed.save')}
          </button>
          <div className="shed-skip">
            <button type="button" className="btn secondary" onClick={() => skip.mutate('NOT_MILKED')}>
              {t('shed.notMilked')}
            </button>
            <button type="button" className="btn secondary" onClick={() => skip.mutate('FORGOT')}>
              {t('shed.forgot')}
            </button>
            <button type="button" className="btn secondary" onClick={() => setActiveId(null)}>
              {t('shed.back')}
            </button>
          </div>
        </div>
      )}

      {round?.status === 'FINISHED' && (
        <div className="card">
          <h2>{t('shed.tank')}</h2>
          <p>
            {t('shed.expected')}: <strong>{round.expected.toFixed(1)} L</strong>
          </p>
          {round.tank?.actualLitres != null && (
            <p>
              {t('shed.actual')}: {round.tank.actualLitres.toFixed(1)} L · {t('shed.variance')}:{' '}
              {round.tank.variancePercent?.toFixed(1)}%
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
              <input
                type="number"
                step="0.1"
                value={actual}
                onChange={(e) => setActual(e.target.value)}
                required
              />
            </label>
            <button type="submit" className="btn">
              {t('shed.saveTank')}
            </button>
          </form>
          <p className="muted">
            {i18n.language === 'ne' ? t('shed.varianceHint') : t('shed.varianceHint')}
          </p>
        </div>
      )}
    </div>
  );
}
