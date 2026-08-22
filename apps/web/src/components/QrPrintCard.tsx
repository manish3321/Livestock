import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { qrDataUrl } from '../lib/qr';

export function QrPrintCard({
  title,
  subtitle,
  url,
}: {
  title: string;
  subtitle?: string;
  url: string;
}) {
  const { t } = useTranslation();
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void qrDataUrl(url).then((d) => {
      if (!cancelled) setDataUrl(d);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  const print = () => {
    if (!dataUrl) return;
    const w = window.open('', '_blank', 'noopener,noreferrer,width=420,height=560');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>${title}</title>
<style>
  body { font-family: Georgia, serif; text-align: center; padding: 24px; color: #1a2e1a; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  p { margin: 0 0 16px; font-size: 13px; color: #445; }
  img { width: 260px; height: 260px; }
  .url { font-size: 10px; word-break: break-all; margin-top: 12px; color: #666; }
</style></head><body>
  <h1>${title}</h1>
  ${subtitle ? `<p>${subtitle}</p>` : ''}
  <img src="${dataUrl}" alt="QR" />
  <p class="url">${url}</p>
  <script>window.onload=()=>{window.print();}</script>
</body></html>`);
    w.document.close();
  };

  return (
    <div className="card qr-card">
      <h2>{t('qr.title')}</h2>
      {dataUrl ? (
        <img className="qr-image" src={dataUrl} alt={t('qr.title')} />
      ) : (
        <p className="muted">{t('common.loading')}</p>
      )}
      <p className="muted" style={{ fontSize: 12, wordBreak: 'break-all' }}>
        {url}
      </p>
      <button className="btn secondary" type="button" onClick={print} disabled={!dataUrl}>
        {t('qr.print')}
      </button>
    </div>
  );
}
