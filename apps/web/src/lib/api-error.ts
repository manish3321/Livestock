import i18n from 'i18next';
import { ApiRequestError } from '../api/client';

/** Codes worth a farmer-readable sentence; anything else falls back to the server message. */
const CODE_KEYS: Record<string, string> = {
  ANIMAL_NOT_FOUND: 'errors.animalNotFound',
  BREEDING_NOT_FOUND: 'errors.breedingNotFound',
  HEAT_NOT_FOUND: 'errors.heatNotFound',
  WEIGHT_NOT_FOUND: 'errors.weightNotFound',
  DAM_REQUIRED: 'errors.damRequired',
  VALIDATION_ERROR: 'errors.validation',
  FORBIDDEN: 'errors.forbidden',
  HTTP_ERROR: 'errors.generic',
};

export function errorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    const key = CODE_KEYS[error.error.code];
    if (key) {
      const translated = i18n.t(key);
      if (translated !== key) return translated;
    }
    if (error.error.message) return error.error.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return i18n.t('errors.generic');
}
