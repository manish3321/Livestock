import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { dailySheet } from '../../api/milk';
import { ErrorState, LoadingState } from '../../components/PageState';

export function DailySheetPage() {
  const { t } = useTranslation();
  const query = useQuery({ queryKey: ['daily-sheet'], queryFn: dailySheet });

  if (query.isLoading) return <LoadingState />;
  if (query.isError) return <ErrorState onRetry={() => query.refetch()} />;

  const rows = query.data ?? [];
  const milking = rows.filter((r) => r.milk && !r.withhold && !r.dry);
  const excluded = rows.filter((r) => !r.milk || r.withhold || r.dry);
  const treatments = rows.filter((r) => r.treatment);
  const withholds = rows.filter((r) => r.withhold);

  return (
    <div className="daily-sheet">
      <Link to="/shed" className="back-link no-print">
        ← {t('nav.shed')}
      </Link>
      <div className="page-header">
        <h1>{t('sheet.title')}</h1>
        <button type="button" className="btn no-print" onClick={() => window.print()}>
          {t('sheet.print')}
        </button>
      </div>
      <p className="muted no-print">{t('sheet.subtitle')}</p>
      <p className="daily-sheet-date">{new Date().toLocaleDateString()}</p>

      <section>
        <h2>{t('sheet.milk')}</h2>
        <SheetTable rows={milking} empty={t('sheet.emptyMilk')} />
      </section>
      <section>
        <h2>{t('sheet.exclude')}</h2>
        <SheetTable
          rows={excluded}
          empty={t('sheet.emptyExclude')}
          dryLabel={t('sheet.dry')}
          holdLabel={t('sheet.hold')}
        />
      </section>
      <section>
        <h2>{t('sheet.treatments')}</h2>
        {treatments.length === 0 ? (
          <p className="muted">{t('sheet.emptyTreatments')}</p>
        ) : (
          <table className="daily-sheet-table">
            <tbody>
              {treatments.map((r) => (
                <tr key={`${r.herdNumber}-rx`}>
                  <td className="daily-sheet-no">{r.herdNumber ?? '—'}</td>
                  <td>{r.name ?? ''}</td>
                  <td>{r.treatment}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <section>
        <h2>{t('sheet.withhold')}</h2>
        {withholds.length === 0 ? (
          <p className="muted">{t('sheet.emptyWithhold')}</p>
        ) : (
          <table className="daily-sheet-table">
            <tbody>
              {withholds.map((r) => (
                <tr key={`${r.herdNumber}-hold`}>
                  <td className="daily-sheet-no">{r.herdNumber ?? '—'}</td>
                  <td>{r.name ?? ''}</td>
                  <td>{r.band ?? t('sheet.hold')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function SheetTable({
  rows,
  empty,
  dryLabel,
  holdLabel,
}: {
  rows: Array<{
    herdNumber: string | null;
    name: string | null;
    shed: string | null;
    withhold: boolean;
    dry: boolean;
    band: string | null;
  }>;
  empty: string;
  dryLabel?: string;
  holdLabel?: string;
}) {
  if (rows.length === 0) return <p className="muted">{empty}</p>;
  return (
    <table className="daily-sheet-table">
      <tbody>
        {rows.map((r) => (
          <tr key={`${r.herdNumber}-${r.shed}`}>
            <td className="daily-sheet-no">{r.herdNumber ?? '—'}</td>
            <td>{r.shed ?? ''}</td>
            <td>{r.name ?? ''}</td>
            {(dryLabel || holdLabel) && (
              <td>
                {r.dry ? dryLabel : ''}
                {r.withhold ? ` ${holdLabel}` : ''}
                {r.band ? ` ${r.band}` : ''}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
