import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ANIMAL_STATUS_LABEL,
  ANIMAL_STATUSES,
  SPECIES,
  SPECIES_LABEL,
  type AnimalStatus,
  type Species,
} from '@farm/contracts';
import { useAuth } from '../../auth/auth-context';
import { SpeciesGlyph } from '../../components/ModuleIcon';
import { ErrorState, LoadingState } from '../../components/PageState';
import { StatusChip } from '../../components/StatusChip';
import { downloadAnimalsCsv, listAnimals } from '../../api/animals';
import { downloadTablePdf } from '../../lib/pdf';

export function AnimalsListPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [species, setSpecies] = useState<Species | ''>('');
  const [status, setStatus] = useState<AnimalStatus | ''>('');

  const query = useQuery({
    queryKey: ['animals', q, species, status],
    queryFn: () =>
      listAnimals({
        q: q || undefined,
        species: species || undefined,
        status: status || undefined,
        pageSize: 100,
      }),
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t('nav.animals')}</h1>
          <p className="page-subtitle">{t('animals.subtitle')}</p>
        </div>
        <div className="page-actions">
          {can('animals:write') && (
            <Link to="/animals/import" className="btn secondary">
              {t('animals.import')}
            </Link>
          )}
          <Link to="/animals/tags" className="btn secondary">
            {t('animals.printTags')}
          </Link>
          {can('export:data') && (
            <>
              <button
                className="btn secondary"
                type="button"
                onClick={() => void downloadAnimalsCsv()}
              >
                {t('animals.exportCsv')}
              </button>
              <button
                className="btn secondary"
                type="button"
                disabled={!query.data?.items.length}
                onClick={() => {
                  const rows = query.data?.items ?? [];
                  downloadTablePdf(
                    t('nav.animals'),
                    'animals.pdf',
                    [
                      t('animals.tag'),
                      t('animals.species'),
                      t('animals.breed'),
                      t('animals.status'),
                      t('animals.weight'),
                    ],
                    rows.map((r) => [
                      r.tag,
                      SPECIES_LABEL[r.species] ?? r.species,
                      r.breed,
                      ANIMAL_STATUS_LABEL[r.status] ?? r.status,
                      r.currentWeightKg != null ? String(r.currentWeightKg) : '—',
                    ]),
                  );
                }}
              >
                {t('animals.exportPdf')}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="toolbar">
        <input
          className="toolbar-search"
          placeholder={t('animals.searchPlaceholder')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="chip-row">
          <button
            type="button"
            className={`filter-chip ${species === '' ? 'active' : ''}`}
            onClick={() => setSpecies('')}
          >
            {t('animals.filterAll')}
          </button>
          {SPECIES.map((s) => (
            <button
              key={s}
              type="button"
              className={`filter-chip ${species === s ? 'active' : ''}`}
              onClick={() => setSpecies(s)}
            >
              {SPECIES_LABEL[s]}
            </button>
          ))}
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as AnimalStatus | '')}
          aria-label={t('animals.status')}
        >
          <option value="">{t('animals.anyStatus')}</option>
              {ANIMAL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`enum.animalStatus.${s}`, { defaultValue: ANIMAL_STATUS_LABEL[s] })}
                </option>
              ))}
        </select>
      </div>

      {query.isLoading && <LoadingState />}
      {query.isError && <ErrorState onRetry={() => void query.refetch()} />}
      {query.data && (
        <>
          <p className="result-count">
            {t('animals.resultCount', { count: query.data.total })}
          </p>
          <div className="animal-grid">
            {query.data.items.map((row) => (
              <Link key={row.id} to={`/animals/${row.id}`} className="animal-card">
                <div className="animal-card-media" data-species={row.species}>
                  <SpeciesGlyph species={row.species} />
                  <div className="animal-card-status">
                    <StatusChip
                      status={row.status}
                      label={t(`enum.animalStatus.${row.status}`, {
                        defaultValue: ANIMAL_STATUS_LABEL[row.status],
                      })}
                    />
                  </div>
                </div>
                <div className="animal-card-body">
                  <p className="animal-card-title">
                    {row.name?.trim() || SPECIES_LABEL[row.species]}
                  </p>
                  <div className="animal-card-tag">{row.herdNumber ?? row.tag}</div>
                  <div className="animal-card-meta">
                    <span>{row.breed}</span>
                    <span>
                      {row.currentWeightKg != null
                        ? `${row.currentWeightKg} kg`
                        : '—'}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
          {query.data.items.length === 0 && (
            <p className="muted">{t('common.empty')}</p>
          )}
        </>
      )}

      {can('animals:write') && (
        <button
          className="btn fab"
          type="button"
          onClick={() => navigate('/animals/new')}
        >
          + {t('animals.add')}
        </button>
      )}
    </div>
  );
}
