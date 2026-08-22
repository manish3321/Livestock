import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ScanResultModal } from '../../components/ScanResultModal';

/** Deep link from printed QR — shows the same popup as the Scan hub. */
export function AnimalScanPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();

  if (!id) return null;

  return (
    <div>
      <Link to="/scan" className="back-link">
        ← {t('nav.scan')}
      </Link>
      <p className="muted">{t('qr.deepLinkHint')}</p>
      <ScanResultModal
        target={{ kind: 'animal', id }}
        onClose={() => navigate('/scan')}
      />
    </div>
  );
}

export function BatchScanPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();

  if (!id) return null;

  return (
    <div>
      <Link to="/scan" className="back-link">
        ← {t('nav.scan')}
      </Link>
      <p className="muted">{t('qr.deepLinkHint')}</p>
      <ScanResultModal
        target={{ kind: 'batch', id }}
        onClose={() => navigate('/scan')}
      />
    </div>
  );
}
