import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { formatDate, type ReproTimelineDto } from '@farm/contracts';
import { animalReproTimeline } from '../../api/breeding';
import { LoadingState } from '../../components/PageState';

export function ReproTimeline({ animalId }: { animalId: string }) {
  const { t, i18n } = useTranslation();
  const np = i18n.language === 'ne';
  const q = useQuery({
    queryKey: ['animals', animalId, 'repro-timeline'],
    queryFn: () => animalReproTimeline(animalId),
  });
  if (q.isLoading) return <LoadingState />;
  if (q.isError || !q.data) return null;
  const row: ReproTimelineDto = q.data;
  return (
    <div className="repro-timeline">
      <p className="repro-headline">{np ? row.headlineNp : row.headlineEn}</p>
      <div className="repro-track" style={{ ['--here' as string]: `${row.youAreHerePct}%` }}>
        {row.milestones.map((mark) => (
          <div key={mark.key} className={`repro-mark ${mark.completed ? 'done' : 'todo'}`}>
            <span className={`repro-dot ${mark.completed ? 'filled' : ''}`} />
            <span className="repro-mark-label">{np ? mark.labelNp : mark.labelEn}</span>
            <span className="muted">
              {mark.day != null ? t('breeding.timeline.day', { n: mark.day }) : '—'}
            </span>
            {mark.remainingDays != null && mark.remainingDays > 0 && (
              <span className="muted">{t('breeding.timeline.inDays', { n: mark.remainingDays })}</span>
            )}
            {mark.date && <span className="muted">{formatDate(mark.date)}</span>}
          </div>
        ))}
        <div className="repro-here" title={t('breeding.timeline.here')} />
      </div>
      {row.next.length > 0 && (
        <>
          <h3>{t('breeding.timeline.next')}</h3>
          <ul className="activity-list">
            {row.next.map((event) => (
              <li key={`${event.type}-${event.dueAt}`}>
                <div>
                  <strong>{np ? event.titleNp : event.titleEn}</strong>
                </div>
                <span className="muted">{formatDate(event.dueAt)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
