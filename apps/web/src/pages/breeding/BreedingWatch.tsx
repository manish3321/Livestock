import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { CountdownUrgency, WatchGroupDto, WatchItemDto } from '@farm/contracts';
import { breedingWatch } from '../../api/breeding';
import { readBreedingWatchCache, writeBreedingWatchCache } from '../../lib/breeding-offline';

const URGENCY: Record<CountdownUrgency, string> = {
  CALM: '#667085',
  NORMAL: '#175cd3',
  SOON: '#b54708',
  IMMINENT: '#b42318',
  OVERDUE: '#b42318',
};

const GROUP_COLOUR: Record<WatchGroupDto['colour'], string> = {
  RED: '#b42318',
  YELLOW: '#b54708',
  BLUE: '#175cd3',
  PURPLE: '#6941c6',
  AMBER: '#b54708',
  GREY: '#475467',
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
  onOpen: (opts: { animalId: string; form?: string }) => void;
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
    onOpen({ animalId: row.animalId, form: formForStage(row.stage) });
  };

  return (
    <div className="breeding-board breeding-watch">
      <div className="board-head">
        <h2>{t('breeding.watch.title')}</h2>
        <p className="muted">
          {offline ? t('breeding.watch.offline') : t('breeding.watch.help')}
          {watch ? ` · ${watch.totalAnimals} ${t('breeding.watch.animals')}` : ''}
        </p>
      </div>

      {!watch || watch.groups.length === 0 ? (
        <p className="board-empty">{t('breeding.watch.empty')}</p>
      ) : (
        watch.groups.map((group) => (
          <section key={group.key} className="board-group">
            <h3 style={{ color: GROUP_COLOUR[group.colour] }}>
              <span className="board-dot" style={{ background: GROUP_COLOUR[group.colour] }} />
              {np ? group.labelNp : group.labelEn}
              <span className="board-sub">{group.items.length}</span>
            </h3>
            <ul>
              {group.items.map((row) => (
                <li key={row.animalId} className="watch-row">
                  <button type="button" className="board-animal" onClick={() => openItem(row)}>
                    {row.photoUrl ? (
                      <img className="watch-photo" src={row.photoUrl} alt="" />
                    ) : (
                      <span className="watch-photo watch-photo-empty" />
                    )}
                    <span className="board-tag">{row.shortNo}</span>
                    <span className="board-meta">
                      <strong>{row.name ?? t('breeding.board.unnamed')}</strong>
                      <span>{row.penName}</span>
                      <span>{np ? row.contextNp : row.contextEn}</span>
                    </span>
                  </button>
                  <div className="watch-count">
                    <div
                      className="watch-bar"
                      aria-hidden="true"
                      style={{
                        ['--watch-pct' as string]: `${row.countdown.progressPct}%`,
                        ['--watch-colour' as string]: URGENCY[row.countdown.urgency],
                      }}
                    />
                    <span style={{ color: URGENCY[row.countdown.urgency] }}>
                      {np ? row.countdown.labelNp : row.countdown.labelEn}
                      {row.countdown.urgency === 'OVERDUE' ? ` · ${t('breeding.watch.overdue')}` : ''}
                    </span>
                    <button
                      type="button"
                      className="board-btn"
                      onClick={() => void navigate(`/animals/${row.animalId}`)}
                    >
                      {t('breeding.watch.openRecord')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
