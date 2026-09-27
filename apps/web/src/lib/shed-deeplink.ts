import type { RecordingMode } from '@farm/contracts';
import { RECORDING_MODES } from '@farm/contracts';

/** Scan / Milk deep-links land on Shed with an animal already identified. */
export function isShedMilkDeepLink(params: URLSearchParams): boolean {
  const animal = params.get('animal');
  if (!animal) return false;
  const mode = params.get('mode');
  if (!mode) return true;
  return mode === 'MILKING';
}

export function shedModeFromParams(params: URLSearchParams): RecordingMode {
  const mode = params.get('mode');
  if (mode && (RECORDING_MODES as readonly string[]).includes(mode)) {
    return mode as RecordingMode;
  }
  if (params.get('animal')) return 'MILKING';
  return 'MILKING';
}
