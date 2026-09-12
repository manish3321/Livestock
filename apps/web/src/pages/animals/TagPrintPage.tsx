import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { printTags } from '../../api/animals';
import { animalScanUrl, qrDataUrl } from '../../lib/qr';

export function TagPrintPage() {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ['tag-print'], queryFn: () => printTags() });
  const [qrs, setQrs] = useState<Record<string, string>>({});

  useEffect(() => {
    void (async () => {
      const next: Record<string, string> = {};
      for (const a of q.data ?? []) {
        next[a.id] = await qrDataUrl(animalScanUrl(a.id));
      }
      setQrs(next);
    })();
  }, [q.data]);

  return (
    <div>
      <Link to="/animals" className="back-link">
        ← {t('nav.animals')}
      </Link>
      <div className="page-header">
        <h1>{t('animals.printTags')}</h1>
        <button type="button" className="btn" onClick={() => window.print()}>
          {t('animals.print')}
        </button>
      </div>
      <p className="muted">{t('animals.printHelp')}</p>
      <div className="tag-sheet">
        {(q.data ?? []).map((a) => (
          <div key={a.id} className="tag-card">
            <div className="tag-number">{a.herdNumber ?? a.tag}</div>
            <div className="tag-number tag-number-back">{a.herdNumber ?? a.tag}</div>
            {qrs[a.id] && <img src={qrs[a.id]} alt="" width={72} height={72} />}
            <small>{a.tag}</small>
          </div>
        ))}
      </div>
    </div>
  );
}
