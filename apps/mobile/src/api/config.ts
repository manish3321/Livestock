/** API origin without trailing slash. Client paths include `/v1/...`. */
export function apiBaseUrl(): string {
  const raw = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4001';
  return raw.replace(/\/$/, '');
}

/**
 * Web app origin for Desktop (pixel-perfect) mode.
 * Emulator: http://10.0.2.2:5173 — Physical: http://LAN:5173 or production URL.
 */
export function webBaseUrl(): string {
  const raw = process.env.EXPO_PUBLIC_WEB_URL ?? 'http://10.0.2.2:5173';
  return raw.replace(/\/$/, '');
}
