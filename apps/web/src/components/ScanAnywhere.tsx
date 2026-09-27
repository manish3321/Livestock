import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Html5Qrcode } from 'html5-qrcode';
import { SPECIES_LABEL, modulesForRole, type AnimalSearchHitDto, type Species } from '@farm/contracts';
import { getAnimal, searchAnimals } from '../api/animals';
import { useAuth } from '../auth/auth-context';
import { parseQrPayload, type QrTarget } from '../lib/qr';
import { AnimalActionGrid } from './AnimalActionGrid';
import { Modal } from './Modal';
import { ScanResultModal } from './ScanResultModal';

const READER_ID = 'farm-scan-anywhere-reader';

interface ScanOverlayValue {
  open: boolean;
  openScan: () => void;
  closeScan: () => void;
}

const ScanOverlayContext = createContext<ScanOverlayValue | null>(null);

export function ScanOverlayProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const value = useMemo<ScanOverlayValue>(
    () => ({
      open,
      openScan: () => setOpen(true),
      closeScan: () => setOpen(false),
    }),
    [open],
  );
  return <ScanOverlayContext.Provider value={value}>{children}</ScanOverlayContext.Provider>;
}

export function useScanOverlay(): ScanOverlayValue {
  const ctx = useContext(ScanOverlayContext);
  if (!ctx) throw new Error('useScanOverlay must be used inside ScanOverlayProvider');
  return ctx;
}

type IdentifyMode = 'camera' | 'manual';
type Step = 'identify' | 'actions';

interface PickedAnimal {
  id: string;
  tag: string;
  name: string | null;
  species: string;
}

function ScanIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M9 6.5h6a2 2 0 0 1 2 2v8.4l-5 2.6-5-2.6V8.5a2 2 0 0 1 2-2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx="12"
        cy="10.2"
        r="1.15"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M10 13.6h4M10 16h2.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Persistent scan control: camera or typed number, then “what are we doing?” */
export function ScanAnywhere() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const location = useLocation();
  const { open, openScan, closeScan } = useScanOverlay();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const handlingRef = useRef(false);
  const [identifyMode, setIdentifyMode] = useState<IdentifyMode>('camera');
  const [step, setStep] = useState<Step>('identify');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<AnimalSearchHitDto[]>([]);
  const [lookingUp, setLookingUp] = useState(false);
  const [animal, setAnimal] = useState<PickedAnimal | null>(null);
  const [batchTarget, setBatchTarget] = useState<QrTarget | null>(null);

  const allowedScan = !!user && modulesForRole(user.role).includes('scan');
  const onScanHub = location.pathname === '/scan' || location.pathname.startsWith('/scan/');
  const onShed = location.pathname === '/shed';

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    if (!scanner) return;
    try {
      if (scanner.isScanning) await scanner.stop();
    } catch {
      /* already stopped */
    }
    try {
      scanner.clear();
    } catch {
      /* ignore */
    }
    scannerRef.current = null;
  }, []);

  const reset = useCallback(() => {
    setIdentifyMode('camera');
    setStep('identify');
    setCameraError(null);
    setLookupError(null);
    setQuery('');
    setHits([]);
    setAnimal(null);
    setBatchTarget(null);
    handlingRef.current = false;
  }, []);

  const close = useCallback(() => {
    void stopScanner();
    reset();
    closeScan();
  }, [closeScan, reset, stopScanner]);

  const pickAnimal = useCallback(
    async (id: string, preview?: PickedAnimal) => {
      await stopScanner();
      if (preview) {
        setAnimal(preview);
        setStep('actions');
        return;
      }
      try {
        const detail = await getAnimal(id);
        setAnimal({
          id: detail.id,
          tag: detail.tag,
          name: detail.name,
          species: detail.species,
        });
      } catch {
        setAnimal({ id, tag: id.slice(0, 8), name: null, species: '' });
      }
      setStep('actions');
    },
    [stopScanner],
  );

  const resolvePayload = useCallback(
    async (raw: string) => {
      if (handlingRef.current) return;
      handlingRef.current = true;
      setLookupError(null);
      try {
        const parsed = parseQrPayload(raw);
        if (parsed?.kind === 'animal') {
          await pickAnimal(parsed.id);
          return;
        }
        if (parsed?.kind === 'batch') {
          await stopScanner();
          reset();
          setBatchTarget(parsed);
          closeScan();
          return;
        }
        const matches = await searchAnimals(raw.trim());
        if (matches.length === 1 && matches[0]) {
          const hit = matches[0];
          await pickAnimal(hit.id, {
            id: hit.id,
            tag: hit.tag,
            name: hit.name,
            species: hit.species,
          });
          return;
        }
        if (matches.length > 1) {
          await stopScanner();
          setHits(matches);
          setIdentifyMode('manual');
          setQuery(raw.trim());
          return;
        }
        setLookupError(t('qr.notFound'));
      } catch (err) {
        setLookupError(err instanceof Error ? err.message : t('qr.notFound'));
      } finally {
        handlingRef.current = false;
      }
    },
    [closeScan, pickAnimal, reset, stopScanner, t],
  );
  const resolvePayloadRef = useRef(resolvePayload);
  resolvePayloadRef.current = resolvePayload;

  useEffect(() => {
    if (!open || step !== 'identify' || identifyMode !== 'camera') {
      void stopScanner();
      return;
    }

    let cancelled = false;
    const start = async () => {
      await stopScanner();
      if (cancelled || !document.getElementById(READER_ID)) return;
      const scanner = new Html5Qrcode(READER_ID);
      scannerRef.current = scanner;
      try {
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 8, qrbox: { width: 240, height: 240 } },
          (decoded) => {
            void resolvePayloadRef.current(decoded);
          },
          () => undefined,
        );
      } catch (err) {
        if (cancelled) return;
        scannerRef.current = null;
        setCameraError(err instanceof Error ? err.message : t('qr.cameraFailed'));
        setIdentifyMode('manual');
      }
    };

    const frame = requestAnimationFrame(() => {
      void start();
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      void stopScanner();
    };
  }, [identifyMode, open, step, stopScanner, t]);

  useEffect(() => {
    if (!open || identifyMode !== 'manual') return;
    const q = query.trim();
    if (q.length < 1) {
      setHits([]);
      return;
    }
    const handle = window.setTimeout(() => {
      setLookingUp(true);
      void searchAnimals(q)
        .then((rows) => {
          setHits(rows);
          setLookupError(rows.length === 0 ? t('qr.notFound') : null);
        })
        .catch((err: unknown) => {
          setLookupError(err instanceof Error ? err.message : t('qr.notFound'));
        })
        .finally(() => setLookingUp(false));
    }, 280);
    return () => window.clearTimeout(handle);
  }, [identifyMode, open, query, t]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close, open]);

  const submitManual = (e: FormEvent) => {
    e.preventDefault();
    const first = hits[0];
    if (hits.length === 1 && first) {
      void pickAnimal(first.id, {
        id: first.id,
        tag: first.tag,
        name: first.name,
        species: first.species,
      });
      return;
    }
    if (query.trim()) void resolvePayload(query.trim());
  };

  if (!allowedScan) return null;

  return (
    <>
      {!onScanHub && !onShed && (
        <button
          className="scan-fab no-print"
          type="button"
          onClick={openScan}
          aria-label={t('qr.fabLabel')}
        >
          <ScanIcon size={26} />
          <span>{t('qr.fabLabel')}</span>
        </button>
      )}

      {open && (
        <Modal
          open
          onClose={close}
          className="scan-anywhere-sheet"
          title={step === 'actions' ? t('qr.whatNext') : t('qr.identifyTitle')}
          label={t('qr.identifyTitle')}
        >
          <>
            {step === 'identify' && (
              <>
                <p className="muted">{t('qr.identifyHint')}</p>
                <div className="page-actions" style={{ marginBottom: 12 }}>
                  <button
                    className={identifyMode === 'camera' ? 'btn' : 'btn secondary'}
                    type="button"
                    onClick={() => {
                      setLookupError(null);
                      setIdentifyMode('camera');
                    }}
                  >
                    {t('qr.useCamera')}
                  </button>
                  <button
                    className={identifyMode === 'manual' ? 'btn' : 'btn secondary'}
                    type="button"
                    onClick={() => {
                      void stopScanner();
                      setIdentifyMode('manual');
                    }}
                  >
                    {t('qr.typeNumber')}
                  </button>
                </div>

                {identifyMode === 'camera' && (
                  <>
                    <div id={READER_ID} className="scan-reader scan-anywhere-reader" />
                    {cameraError && <p className="error-text">{cameraError}</p>}
                  </>
                )}

                {identifyMode === 'manual' && (
                  <form className="inline-form" style={{ flexWrap: 'wrap' }} onSubmit={submitManual}>
                    <input
                      type="text"
                      data-autofocus
                      autoCapitalize="characters"
                      placeholder={t('qr.manualPlaceholder')}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      aria-label={t('qr.manualPlaceholder')}
                    />
                    <button className="btn" type="submit" disabled={lookingUp || !query.trim()}>
                      {lookingUp ? t('qr.searching') : t('qr.lookupAnimal')}
                    </button>
                  </form>
                )}

                {lookupError && <p className="error-text">{lookupError}</p>}

                {hits.length > 0 && (
                  <div className="scan-hit-list">
                    <h3 className="scan-modal-subtitle">{t('qr.pickAnimal')}</h3>
                    {hits.map((hit) => (
                      <button
                        key={hit.id}
                        type="button"
                        className="scan-hit"
                        onClick={() =>
                          void pickAnimal(hit.id, {
                            id: hit.id,
                            tag: hit.tag,
                            name: hit.name,
                            species: hit.species,
                          })
                        }
                      >
                        <strong>{hit.tag}</strong>
                        <span>
                          {hit.name?.trim() || SPECIES_LABEL[hit.species as Species] || hit.species}
                          {hit.penName ? ` · ${hit.penName}` : ''}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {step === 'actions' && animal && (
              <>
                <p className="muted">{t('qr.scanAnimal')}</p>
                <h3 className="scan-picked-name">
                  {animal.name?.trim() || SPECIES_LABEL[animal.species as Species] || animal.species}{' '}
                  #{animal.tag}
                </h3>
                <p className="muted">{t('qr.whatNextHint')}</p>
                <AnimalActionGrid animalId={animal.id} onNavigate={close} />
                <div className="page-actions" style={{ marginTop: 16 }}>
                  <button
                    className="btn secondary"
                    type="button"
                    onClick={() => {
                      setAnimal(null);
                      setHits([]);
                      setQuery('');
                      setLookupError(null);
                      setStep('identify');
                      setIdentifyMode('camera');
                    }}
                  >
                    {t('qr.backToScan')}
                  </button>
                </div>
              </>
            )}
          </>
        </Modal>
      )}

      {batchTarget && (
        <ScanResultModal
          target={batchTarget}
          onClose={() => {
            setBatchTarget(null);
            closeScan();
          }}
        />
      )}
    </>
  );
}

export function TopbarScanButton() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const location = useLocation();
  const { openScan } = useScanOverlay();
  const allowedScan = !!user && modulesForRole(user.role).includes('scan');
  const onScanHub = location.pathname === '/scan' || location.pathname.startsWith('/scan/');
  const onShed = location.pathname === '/shed';
  if (!allowedScan || onScanHub || onShed) return null;
  return (
    <button className="btn ghost scan-topbar-btn no-print" type="button" onClick={openScan} aria-label={t('qr.fabLabel')}>
      <ScanIcon size={18} />
    </button>
  );
}
