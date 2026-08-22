import QRCode from 'qrcode';

/** Absolute URL encoded in printed QR codes (opens the in-app scan page). */
export function animalScanUrl(animalId: string): string {
  return `${window.location.origin}/scan/a/${animalId}`;
}

export function batchScanUrl(batchId: string): string {
  return `${window.location.origin}/scan/b/${batchId}`;
}

export async function qrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 280,
    color: { dark: '#1a2e1a', light: '#ffffff' },
  });
}

const UUID_RE =
  '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';

export type QrTarget =
  | { kind: 'animal'; id: string }
  | { kind: 'batch'; id: string };

/** Parse printed QR text (full URL or path) into an animal/batch target. */
export function parseQrPayload(raw: string): QrTarget | null {
  const text = raw.trim();
  if (!text) return null;

  const animalMatch = text.match(new RegExp(`(?:/scan/a/|farm://a/)(${UUID_RE})`, 'i'));
  if (animalMatch?.[1]) return { kind: 'animal', id: animalMatch[1].toLowerCase() };

  const batchMatch = text.match(new RegExp(`(?:/scan/b/|farm://b/)(${UUID_RE})`, 'i'));
  if (batchMatch?.[1]) return { kind: 'batch', id: batchMatch[1].toLowerCase() };

  return null;
}
