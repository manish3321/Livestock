import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { CountdownUrgency, WatchGroupDto, WatchItemDto } from '@farm/contracts';
import { breedingWatch } from '../../api/breeding';
import { readBreedingWatchCache, writeBreedingWatchCache } from '../../lib/breeding-offline';
import { SpeciesThumb } from './SpeciesThumb';

const URGENCY: Record<CountdownUrgency, string> = {
  CALM: '#6B6F68',
  NORMAL: '#2A6A4A',
  SOON: '#E65100',
  IMMINENT: '#C62828',
  OVERDUE: '#C62828',
};

const URGENCY_WASH: Record<CountdownUrgency, string> = {
  CALM: 'transparent',
  NORMAL: 'rgba(42, 106, 74, 0.06)',
  SOON: 'rgba(230, 81, 0, 0.1)',
  IMMINENT: 'rgba(198, 40, 40, 0.1)',
  OVERDUE: 'rgba(198, 40, 40, 0.12)',
};

const GROUP_COLOUR: Record<WatchGroupDto['colour'], string> = {
  RED: '#C62828',
  YELLOW: '#E65100',
  BLUE: '#2A6A4A',
  PURPLE: '#1F4D38',
  AMBER: '#E65100',
  GREY: '#6B6F68',
};

function formForStage(stage: string): string | undefined {
  if (stage === 'IN_HEAT') return 'service';
  if (stage === 'AWAITING_HEAT' || stage === 'ANESTRUS_SUSPECTED') return 'heat';
  if (stage === 'PREGNANCY_CHECK_DUE' || stage === 'SERVED_UNCONFIRMED') return 'pd';
  if (stage === 'CALVING_IMMINENT' || stage === 'DRY_PREGNANT' || stage === 'PREGNANT_DRYOFF_DUE') {
    return 'calving';
  }
  if (stage === 'FRESH') return 'colostrum';
  return undefined;
}

export function BreedingWatch({
  onOpen,
}: {
  onOpen: (opts: { animalId: string; form?: string; tab?: 'walk' }) => void;
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const np = i18n.language === 'ne';
  const cached = readBreedingWatchCache();
  const watchQ = useQuery({
    queryKey: ['breeding', 'watch'],
    queryFn: async () => {
      const watch = await breedingWatch();
      writeBreedingWatchCache(watch);
      return watch;
    },
    placeholderData: cached ?? undefined,
  });
  const watch = watchQ.data ?? cached ?? undefined;
  const offline = watchQ.isError && Boolean(cached);

  const openItem = (row: WatchItemDto) => {
    if (row.stage === 'IN_HEAT') {
      onOpen({ animalId: row.animalId, form: 'service', tab: 'walk' });
      return;
    }
    onOpen({ animalId: row.animalId, form: formForStage(row.stage) });
  };

  return (
    <div className="breeding-board breeding-watch breeding-desk-board">
      <div className="board-head">
        <h2>{t('breeding.watch.title')}</h2>
        <p className="board-head-help">
          {offline ? t('breeding.watch.offline') : t('breeding.watch.help')}
          {watch ? (
            <span className="board-head-counts">
              {' '}
              · {watch.totalAnimals} {t('breeding.watch.animals')}
            </span>
          ) : (
            ''
          )}
        </p>
      </div>

      {!watch || watch.groups.length === 0 ? (
        <p className="board-empty">{t('breeding.watch.empty')}</p>
      ) : (
        watch.groups.map((group, gi) => (
          <section
            key={group.key}
            className={`board-group board-group-${group.colour.toLowerCase()}`}
            style={{
              ['--group-colour' as string]: GROUP_COLOUR[group.colour],
              animationDelay: `${gi * 40}ms`,
            }}
          >
            <header className="board-group-head">
              <h3 className="board-group-title">{np ? group.labelNp : group.labelEn}</h3>
              <p className="board-sub">{group.items.length}</p>
            </header>
            <ul className="board-list">
              {group.items.map((row) => {
                const nextForm = formForStage(row.stage);
                const urgencyColour = URGENCY[row.countdown.urgency];
                return (
                  <li
                    key={row.animalId}
                    className={`board-row watch-row watch-urgency-${row.countdown.urgency.toLowerCase()}`}
                    style={{
                      ['--urgency' as string]: urgencyColour,
                      ['--urgency-wash' as string]: URGENCY_WASH[row.countdown.urgency],
                    }}
                  >
                    <button type="button" className="board-animal" onClick={() => openItem(row)}>
                      <span className="board-urgency" aria-hidden="true" />
                      <SpeciesThumb
                        species={row.species}
                        photoUrl={row.photoUrl}
                        name={row.name}
                        np={np}
                      />
                      <span className="board-identity">
                        <span className="board-tag">{row.shortNo}</span>
                        <span className="board-name">{row.name ?? t('breeding.board.unnamed')}</span>
                        {row.penName ? <span className="board-pen">{row.penName}</span> : null}
                      </span>
                      <span className="board-timing">
                        {(np ? row.contextNp : row.contextEn) !==
                          (np ? row.countdown.labelNp : row.countdown.labelEn) && (
                          <span className="board-why">{np ? row.contextNp : row.contextEn}</span>
                        )}
                        <span className="board-late" style={{ color: urgencyColour }}>
                          {np ? row.countdown.labelNp : row.countdown.labelEn}
                        </span>
                      </span>
                    </button>
                    <div className="board-actions watch-count">
                      <div
                        className="watch-bar"
                        aria-hidden="true"
                        style={{
                          ['--watch-pct' as string]: `${Math.max(row.countdown.progressPct, 8)}%`,
                          ['--watch-colour' as string]: urgencyColour,
                        }}
                      />
                      {row.stage === 'IN_HEAT' ? (
                        <button type="button" className="board-btn primary" onClick={() => openItem(row)}>
                          {t('breeding.watch.openWalk')}
                        </button>
                      ) : nextForm ? (
                        <button
                          type="button"
                          className={`board-btn ${
                            row.countdown.urgency === 'OVERDUE' || row.countdown.urgency === 'IMMINENT'
                              ? 'primary'
                              : ''
                          }`}
                          onClick={() => openItem(row)}
                        >
                          {t(`breeding.watch.action.${nextForm}`)}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="board-btn"
                          onClick={() => void navigate(`/animals/${row.animalId}`)}
                        >
                          {t('breeding.watch.openRecord')}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
