import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ANIMAL_STATUS_LABEL,
  ANIMAL_STATUSES,
  SPECIES,
  SPECIES_LABEL,
  type AnimalDto,
  type AnimalStatus,
  type Species,
} from '@farm/contracts';
import { useAuth } from '../../auth/auth-context';
import { AnimalActionGrid } from '../../components/AnimalActionGrid';
import { DeleteButton } from '../../components/Modal';
import { SpeciesGlyph } from '../../components/ModuleIcon';
import { ErrorState, LoadingState } from '../../components/PageState';
import { StatusChip } from '../../components/StatusChip';
import { deleteAnimal, downloadAnimalsCsv, listAnimals } from '../../api/animals';
import { downloadTablePdf } from '../../lib/pdf';
import { parseSpeciesParam } from '../../lib/livestock';

export function AnimalsListPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const species = parseSpeciesParam(params.get('species'));
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<AnimalStatus | ''>('');
  const [openId, setOpenId] = useState<string | null>(null);

  const searching = q.trim().length > 0;
  const showPicker = !species && !searching;

  const counts = useQueries({
    queries: SPECIES.map((s) => ({
      queryKey: ['animals', 'count', s],
      queryFn: () => listAnimals({ species: s, pageSize: 1 }),
    })),
  });

  const query = useQuery({
    queryKey: ['animals', q, species, status],
    queryFn: () =>
      listAnimals({
        q: q.trim() || undefined,
        species: species || undefined,
        status: status || undefined,
        pageSize: 200,
      }),
    enabled: !showPicker,
  });

  const setSpecies = (next: Species | '') => {
    setOpenId(null);
    setParams(
      (current) => {
        const copy = new URLSearchParams(current);
        if (next) copy.set('species', next);
        else copy.delete('species');
        return copy;
      },
      { replace: true },
    );
  };

  const addPath = species ? `/animals/new?species=${species}` : '/animals/new';

  return (
    <div>
      <div className="page-header">
        <div>
          {!showPicker && (
            <button type="button" className="back-link" onClick={() => setSpecies('')}>
              ← {t('animals.backToKinds')}
            </button>
          )}
          <h1>
            {species ? SPECIES_LABEL[species] : t('nav.animals')}
          </h1>
          <p className="page-subtitle">
            {showPicker ? t('animals.chooseKindHint') : t('animals.subtitle')}
          </p>
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
          onChange={(e) => {
            setQ(e.target.value);
            setOpenId(null);
          }}
        />
        {!showPicker && (
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
        )}
      </div>

      {showPicker && (
        <div className="species-pick-grid">
          {SPECIES.map((s, i) => (
            <button
              key={s}
              type="button"
              className="species-pick"
              onClick={() => setSpecies(s)}
            >
              <SpeciesGlyph species={s} />
              <strong>{SPECIES_LABEL[s]}</strong>
              <span className="species-pick-count">
                {counts[i]?.data?.total ?? (counts[i]?.isLoading ? '…' : 0)}
              </span>
            </button>
          ))}
        </div>
      )}

      {!showPicker && query.isLoading && <LoadingState />}
      {!showPicker && query.isError && <ErrorState onRetry={() => void query.refetch()} />}
      {!showPicker && query.data && (
        <>
          <p className="result-count">
            {query.data.total > query.data.items.length
              ? t('animals.showingFirst', {
                  shown: query.data.items.length,
                  total: query.data.total,
                })
              : t('animals.resultCount', { count: query.data.total })}
          </p>
          <div className="herd-list">
            {query.data.items.map((row) => (
              <HerdRow
                key={row.id}
                row={row}
                showSpecies={!species}
                open={openId === row.id}
                onToggle={() => setOpenId((id) => (id === row.id ? null : row.id))}
              />
            ))}
          </div>
          {query.data.items.length === 0 && (
            <p className="muted">{t('common.empty')}</p>
          )}
        </>
      )}

      {can('animals:write') && (
        <button className="btn fab" type="button" onClick={() => navigate(addPath)}>
          + {t('animals.add')}
        </button>
      )}
    </div>
  );
}

function HerdRow({
  row,
  showSpecies,
  open,
  onToggle,
}: {
  row: AnimalDto;
  showSpecies: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const { can } = useAuth();
  const qc = useQueryClient();
  const label = row.herdNumber ?? row.tag;
  const name = row.name?.trim();
  const deleteMut = useMutation({
    meta: { successKey: 'common.deleted' },
    mutationFn: () => deleteAnimal(row.id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['animals'] });
      onToggle();
    },
  });

  return (
    <article className={`herd-row${open ? ' open' : ''}`}>
      <button
        type="button"
        className="herd-row-toggle"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className="herd-row-id">{label}</span>
        <span className="herd-row-name">
          {name || SPECIES_LABEL[row.species]}
          {showSpecies && name ? ` · ${SPECIES_LABEL[row.species]}` : ''}
        </span>
        <StatusChip
          status={row.status}
          label={t(`enum.animalStatus.${row.status}`, {
            defaultValue: ANIMAL_STATUS_LABEL[row.status],
          })}
        />
        <span className="herd-row-kg">
          {row.currentWeightKg != null ? `${row.currentWeightKg} kg` : '—'}
        </span>
        <span className="herd-chevron" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div className="herd-row-panel">
          <div className="herd-snap">
            <span>
              {t('animals.breed')}: {row.breed || '—'}
            </span>
            <span>
              {t('animals.shed')}: {row.shed || '—'}
            </span>
            {row.isPregnant && <span>{t('enum.animalStatus.PREGNANT')}</span>}
            {row.gender === 'FEMALE' || row.gender === 'MALE' ? (
              <span>{row.gender === 'FEMALE' ? t('animals.female') : t('animals.male')}</span>
            ) : null}
          </div>
          <AnimalActionGrid animalId={row.id} compact />
          <div className="herd-row-actions" style={{ marginTop: 8 }}>
            {can('animals:write') && (
              <Link className="btn secondary" to={`/animals/${row.id}/edit`}>
                {t('common.edit')}
              </Link>
            )}
            {can('animals:delete') && (
              <DeleteButton
                message={t('animals.confirmDelete')}
                pending={deleteMut.isPending}
                onConfirm={() => deleteMut.mutate()}
              />
            )}
          </div>
        </div>
      )}
    </article>
  );
}
