import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SPECIES_LABEL, type Species } from '@farm/contracts';
import { useAuth } from '../auth/auth-context';
import { animalActions, type AnimalActionId } from '../lib/animal-actions';
import { AnimalActionGrid } from './AnimalActionGrid';
import { AnimalPhoto } from './AnimalPhoto';

const BREEDING_STEPS: AnimalActionId[] = ['heat', 'service', 'pd', 'calving'];

export interface ChosenAnimal {
  id: string;
  tag: string;
  shortNo?: string | null;
  name?: string | null;
  species?: string | null;
  penName?: string | null;
  photoUrl?: string | null;
}

/** After a scan or typed number: one big choice — milk, vaccine or breeding. */
export function AnimalChoices({
  animal,
  onNavigate,
  showOther = true,
}: {
  animal: ChosenAnimal;
  onNavigate?: () => void;
  showOther?: boolean;
}) {
  const { t } = useTranslation();
  const { can } = useAuth();
  const [breedingOpen, setBreedingOpen] = useState(false);
  const [otherOpen, setOtherOpen] = useState(false);
  const actions = animalActions(animal.id);
  const to = (id: AnimalActionId) => actions.find((a) => a.id === id)!.to;
  const label = animal.shortNo ?? animal.tag;

  return (
    <div className="animal-choices">
      <div className="animal-choice-head">
        <AnimalPhoto photoUrl={animal.photoUrl} species={animal.species} size={84} />
        <div>
          <strong className="animal-choice-no">{label}</strong>
          <span className="muted">
            {[
              animal.name?.trim() ||
                (animal.species ? (SPECIES_LABEL[animal.species as Species] ?? animal.species) : null),
              animal.penName,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </div>
      </div>

      <h3 className="animal-choice-title">{t('qr.chooseTitle')}</h3>
      <p className="muted animal-choice-hint">{t('qr.chooseHint')}</p>

      <div className="animal-choice-grid">
        {can('rounds:write') && (
          <Link className="animal-choice animal-choice-milk" to={to('milk')} onClick={onNavigate}>
            <span className="animal-choice-icon" aria-hidden="true">🥛</span>
            <strong>{t('qr.choice.milk')}</strong>
            <span>{t('qr.choice.milkHint')}</span>
          </Link>
        )}
        {can('health:write') && (
          <Link className="animal-choice animal-choice-vaccine" to={to('vaccine')} onClick={onNavigate}>
            <span className="animal-choice-icon" aria-hidden="true">💉</span>
            <strong>{t('qr.choice.vaccine')}</strong>
            <span>{t('qr.choice.vaccineHint')}</span>
          </Link>
        )}
        {can('breeding:write') && (
          <button
            type="button"
            className={`animal-choice animal-choice-breeding${breedingOpen ? ' is-open' : ''}`}
            aria-expanded={breedingOpen}
            onClick={() => setBreedingOpen((v) => !v)}
          >
            <span className="animal-choice-icon" aria-hidden="true">🐮</span>
            <strong>{t('qr.choice.breeding')}</strong>
            <span>{t('qr.choice.breedingHint')}</span>
          </button>
        )}
      </div>

      {breedingOpen && (
        <div className="animal-choice-sub">
          <p className="muted">{t('qr.breedingWhich')}</p>
          <div className="animal-choice-sub-grid">
            {BREEDING_STEPS.map((id) => (
              <Link key={id} className="btn secondary" to={to(id)} onClick={onNavigate}>
                {t(`qr.action.${id}`)}
              </Link>
            ))}
          </div>
        </div>
      )}

      {showOther && (
        <>
          <button
            type="button"
            className="btn ghost animal-choice-other"
            aria-expanded={otherOpen}
            onClick={() => setOtherOpen((v) => !v)}
          >
            {t('qr.otherActions')} {otherOpen ? '▴' : '▾'}
          </button>
          {otherOpen && <AnimalActionGrid animalId={animal.id} onNavigate={onNavigate} />}
        </>
      )}
    </div>
  );
}
