import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { AnimalImportPreviewRow } from '@farm/contracts';
import { commitAnimalImport, previewAnimalImport } from '../../api/animals';

export function AnimalsImportPage() {
  const { t } = useTranslation();
  const [csv, setCsv] = useState('');
  const [rows, setRows] = useState<AnimalImportPreviewRow[]>([]);

  const preview = useMutation({
    mutationFn: () => previewAnimalImport(csv),
    onSuccess: setRows,
  });
  const commit = useMutation({
    mutationFn: () =>
      commitAnimalImport(rows.filter((r) => r.data && r.errors.length === 0).map((r) => r.data!)),
  });

  const ok = rows.filter((r) => r.data && r.errors.length === 0).length;
  const bad = rows.filter((r) => r.errors.length > 0).length;

  return (
    <div>
      <Link to="/animals" className="back-link">
        ← {t('nav.animals')}
      </Link>
      <h1>{t('animals.importTitle')}</h1>
      <p className="muted">{t('animals.importHelp')}</p>
      <textarea
        rows={10}
        className="shed-search-input"
        style={{ width: '100%', fontFamily: 'monospace' }}
        placeholder="tag,name,species,breed,gender,status,shed"
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
      />
      <div className="page-actions" style={{ marginTop: 12 }}>
        <button type="button" className="btn" onClick={() => preview.mutate()} disabled={!csv.trim()}>
          {t('animals.preview')}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => commit.mutate()}
          disabled={ok === 0 || commit.isPending}
        >
          {t('animals.commit', { n: ok })}
        </button>
      </div>
      {rows.length > 0 && (
        <p>
          {ok} {t('animals.ready')} · {bad} {t('animals.rowErrors')}
        </p>
      )}
      {commit.data && (
        <p className="muted">
          {t('animals.imported', { n: commit.data.created })}
        </p>
      )}
      <ul>
        {rows
          .filter((r) => r.errors.length)
          .map((r) => (
            <li key={r.row} className="error-text">
              {t('animals.row')} {r.row}: {r.errors.join('; ')}
            </li>
          ))}
      </ul>
    </div>
  );
}
