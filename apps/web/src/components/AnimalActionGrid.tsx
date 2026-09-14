import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/auth-context';
import { visibleAnimalActions, type AnimalActionGroup } from '../lib/animal-actions';
import { herdRowActions } from '../lib/livestock';

const GROUPS: AnimalActionGroup[] = ['record', 'breeding', 'more'];

export function AnimalActionGrid({
  animalId,
  onNavigate,
  compact = false,
}: {
  animalId: string;
  onNavigate?: () => void;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const { can } = useAuth();
  const actions = compact ? herdRowActions(animalId, can) : visibleAnimalActions(animalId, can);

  if (compact) {
    return (
      <div className="herd-row-actions">
        {actions.map((action) => (
          <Link
            key={action.id}
            className={action.id === 'profile' ? 'btn' : 'btn secondary'}
            to={action.to}
            onClick={onNavigate}
          >
            {t(action.labelKey)}
          </Link>
        ))}
      </div>
    );
  }

  return (
    <div className="scan-action-groups">
      {GROUPS.map((group) => {
        const items = actions.filter((a) => a.group === group);
        if (items.length === 0) return null;
        return (
          <section key={group}>
            <h3 className="scan-modal-subtitle">{t(`qr.group.${group}`)}</h3>
            <div className={`scan-action-grid${group === 'more' ? ' scan-action-grid-more' : ''}`}>
              {items.map((action) => (
                <Link
                  key={action.id}
                  className={group === 'more' ? 'btn secondary scan-action-tile' : 'btn scan-action-tile'}
                  to={action.to}
                  onClick={onNavigate}
                >
                  {t(action.labelKey)}
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
