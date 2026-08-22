import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Html5Qrcode } from 'html5-qrcode';
import { listAnimals } from '../../api/animals';
import { listBatches } from '../../api/batches';
import { ScanResultModal } from '../../components/ScanResultModal';
import { parseQrPayload, type QrTarget } from '../../lib/qr';

const READER_ELEMENT_ID = 'farm-qr-reader';

export function ScanHubPage() {
  const { t } = useTranslation();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const handlingRef = useRef(false);
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [tagQuery, setTagQuery] = useState('');
  const [batchQuery, setBatchQuery] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const [target, setTarget] = useState<QrTarget | null>(null);

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    if (!scanner) return;
    try {
      if (scanner.isScanning) {
        await scanner.stop();
      }
    } catch {
      /* already stopped */
    }
    try {
      scanner.clear();
    } catch {
      /* ignore */
    }
    scannerRef.current = null;
    setScanning(false);
  }, []);

  const openTarget = useCallback(
    async (next: QrTarget) => {
      if (handlingRef.current) return;
      handlingRef.current = true;
      await stopScanner();
      setTarget(next);
      handlingRef.current = false;
    },
    [stopScanner],
  );

  const startScanner = useCallback(async () => {
    setCameraError(null);
    await stopScanner();

    if (!document.getElementById(READER_ELEMENT_ID)) return;

    const scanner = new Html5Qrcode(READER_ELEMENT_ID);
    scannerRef.current = scanner;

    try {
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 8, qrbox: { width: 240, height: 240 } },
        (decoded) => {
          const parsed = parseQrPayload(decoded);
          if (parsed) void openTarget(parsed);
        },
        () => {
          /* ignore frame miss */
        },
      );
      setScanning(true);
    } catch (err) {
      scannerRef.current = null;
      setScanning(false);
      setCameraError(err instanceof Error ? err.message : t('qr.cameraFailed'));
    }
  }, [openTarget, stopScanner, t]);

  useEffect(() => {
    void startScanner();
    return () => {
      void stopScanner();
    };
    // Intentionally mount-only so the camera is not restarted on every callback identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closeModal = () => {
    setTarget(null);
    void startScanner();
  };

  const lookupAnimalTag = async (e: FormEvent) => {
    e.preventDefault();
    const q = tagQuery.trim();
    if (!q) return;
    setLookupError(null);
    setLookingUp(true);
    try {
      const page = await listAnimals({ q, pageSize: 25 });
      const exact = page.items.find((a) => a.tag.toUpperCase() === q.toUpperCase());
      const match = exact ?? page.items[0];
      if (!match) {
        setLookupError(t('qr.notFound'));
        return;
      }
      await openTarget({ kind: 'animal', id: match.id });
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : t('qr.notFound'));
    } finally {
      setLookingUp(false);
    }
  };

  const lookupBatchName = async (e: FormEvent) => {
    e.preventDefault();
    const q = batchQuery.trim();
    if (!q) return;
    setLookupError(null);
    setLookingUp(true);
    try {
      const page = await listBatches({ q, pageSize: 25 });
      const exact = page.items.find((b) => b.name.toLowerCase() === q.toLowerCase());
      const match = exact ?? page.items[0];
      if (!match) {
        setLookupError(t('qr.notFound'));
        return;
      }
      await openTarget({ kind: 'batch', id: match.id });
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : t('qr.notFound'));
    } finally {
      setLookingUp(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t('nav.scan')}</h1>
          <p className="page-subtitle">{t('qr.hubSubtitle')}</p>
        </div>
        <div className="page-actions">
          {scanning ? (
            <button className="btn secondary" type="button" onClick={() => void stopScanner()}>
              {t('qr.stopCamera')}
            </button>
          ) : (
            <button className="btn" type="button" onClick={() => void startScanner()}>
              {t('qr.startCamera')}
            </button>
          )}
        </div>
      </div>

      <div className="detail-grid">
        <div className="card scan-camera-card">
          <h2>{t('qr.cameraTitle')}</h2>
          <p className="muted">{t('qr.cameraHint')}</p>
          <div id={READER_ELEMENT_ID} className="scan-reader" />
          {cameraError && <p className="error-text">{cameraError}</p>}
          {!scanning && !cameraError && <p className="muted">{t('qr.cameraIdle')}</p>}
        </div>

        <div className="card">
          <h2>{t('qr.manualTitle')}</h2>
          <p className="muted">{t('qr.manualHint')}</p>

          <form className="inline-form" style={{ flexWrap: 'wrap' }} onSubmit={lookupAnimalTag}>
            <input
              type="text"
              placeholder={t('qr.animalTagPlaceholder')}
              value={tagQuery}
              onChange={(e) => setTagQuery(e.target.value)}
              aria-label={t('qr.animalTagPlaceholder')}
            />
            <button className="btn secondary" type="submit" disabled={lookingUp}>
              {t('qr.lookupAnimal')}
            </button>
          </form>

          <form
            className="inline-form"
            style={{ flexWrap: 'wrap', marginTop: 12 }}
            onSubmit={lookupBatchName}
          >
            <input
              type="text"
              placeholder={t('qr.batchNamePlaceholder')}
              value={batchQuery}
              onChange={(e) => setBatchQuery(e.target.value)}
              aria-label={t('qr.batchNamePlaceholder')}
            />
            <button className="btn secondary" type="submit" disabled={lookingUp}>
              {t('qr.lookupBatch')}
            </button>
          </form>

          {lookupError && <p className="error-text">{lookupError}</p>}
        </div>
      </div>

      {target && <ScanResultModal target={target} onClose={closeModal} />}
    </div>
  );
}
