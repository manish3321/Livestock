import { NativeModules, Platform } from 'react-native';

/**
 * Host running Metro (LAN IP when using Expo Go on a phone).
 * Example scriptURL: http://192.168.1.10:8081/index.bundle?platform=android&...
 */
function bundlerHost(): string | null {
  try {
    const scriptURL = (NativeModules.SourceCode as { scriptURL?: string } | undefined)?.scriptURL;
    if (!scriptURL) return null;
    const match = scriptURL.match(/^https?:\/\/([^/:]+)(?::\d+)?/i);
    const host = match?.[1]?.trim();
    if (!host) return null;
    if (host === 'localhost' || host === '127.0.0.1') return null;
    return host;
  } catch {
    return null;
  }
}

function isLoopbackAlias(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '10.0.2.2' ||
    hostname === '[::1]'
  );
}

/** Loopback or private-LAN dev hosts — the only origins worth rewriting to emulator/Metro hosts. */
function isLocalDevHost(hostname: string): boolean {
  if (isLoopbackAlias(hostname) || hostname.endsWith('.local')) return true;
  const m = hostname.match(/^(\d+)\.(\d+)\.\d+\.\d+$/);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}

function isLocalDevOrigin(raw: string): boolean {
  try {
    return isLocalDevHost(new URL(raw).hostname);
  } catch {
    return false;
  }
}

function withHostname(raw: string, hostname: string): string {
  const url = new URL(raw);
  url.hostname = hostname;
  return url.origin.replace(/\/$/, '');
}

const PRODUCTION_ORIGIN = 'https://evoqedlivestockfarm.vercel.app';

function configuredOrigin(): string {
  return (process.env.EXPO_PUBLIC_API_URL ?? PRODUCTION_ORIGIN).replace(/\/$/, '');
}

/**
 * Android emulator / AVD — LAN IPs like 192.168.x often time out from the guest;
 * host loopback is always 10.0.2.2.
 */
function isAndroidEmulator(): boolean {
  if (Platform.OS !== 'android') return false;
  if (bundlerHost() === '10.0.2.2') return true;
  const c = Platform.constants as {
    Brand?: string;
    Model?: string;
    Fingerprint?: string;
    Manufacturer?: string;
  };
  const hay = `${c.Fingerprint ?? ''} ${c.Model ?? ''} ${c.Brand ?? ''} ${c.Manufacturer ?? ''}`.toLowerCase();
  return /generic|emulator|sdk_gphone|google_sdk|ranchu|goldfish|sdk_phone/.test(hay);
}

/** Sticky origin after a successful probe — avoids flapping between LAN and 10.0.2.2. */
let stickyOrigin: string | null = null;

export function noteWorkingOrigin(origin: string): void {
  stickyOrigin = origin.replace(/\/$/, '');
}

/**
 * Ordered API origins to try. Emulator prefers 10.0.2.2 (host loopback);
 * physical devices prefer the Metro LAN host.
 */
export function apiBaseUrlCandidates(): string[] {
  const raw = configuredOrigin();
  if (!isLocalDevOrigin(raw)) return [raw];
  const out: string[] = [];
  const add = (origin: string) => {
    if (!out.includes(origin)) out.push(origin);
  };

  if (stickyOrigin) add(stickyOrigin);

  if (isAndroidEmulator()) {
    add(withHostname(raw, '10.0.2.2'));
    const host = bundlerHost();
    if (host && host !== '10.0.2.2') add(withHostname(raw, host));
    try {
      const configuredHost = new URL(raw).hostname;
      if (!isLoopbackAlias(configuredHost)) add(raw);
    } catch {
      /* ignore */
    }
    return out;
  }

  // Physical device / iOS simulator
  try {
    const url = new URL(raw);
    if (isLoopbackAlias(url.hostname)) {
      const host = bundlerHost();
      if (host && host !== '10.0.2.2') add(withHostname(raw, host));
      add(raw);
    } else {
      add(raw);
      const host = bundlerHost();
      if (host && host !== url.hostname) add(withHostname(raw, host));
      // Last-resort for mis-detected emulator still on Android.
      if (Platform.OS === 'android') add(withHostname(raw, '10.0.2.2'));
    }
  } catch {
    add(raw);
  }

  return out;
}

/**
 * API origin without trailing slash. Client paths include `/v1/...`.
 *
 * - Android emulator → host via 10.0.2.2 (LAN IPs flap/timeout from AVD).
 * - Physical Expo Go → Metro LAN host when env still points at localhost/10.0.2.2.
 */
export function apiBaseUrl(): string {
  return apiBaseUrlCandidates()[0] ?? configuredOrigin();
}

/**
 * Web app origin for Desktop (pixel-perfect) mode.
 * Emulator: http://10.0.2.2:5173 — Physical: same LAN rewrite as the API.
 */
export function webBaseUrl(): string {
  const raw = (process.env.EXPO_PUBLIC_WEB_URL ?? PRODUCTION_ORIGIN).replace(/\/$/, '');
  if (!isLocalDevOrigin(raw)) return raw;
  if (isAndroidEmulator()) {
    try {
      return withHostname(raw, '10.0.2.2');
    } catch {
      return 'http://10.0.2.2:5173';
    }
  }
  try {
    const url = new URL(raw);
    if (!isLoopbackAlias(url.hostname)) return raw;
    const host = bundlerHost();
    if (!host || host === '10.0.2.2') return raw;
    return withHostname(raw, host);
  } catch {
    return raw;
  }
}

/** Last successful API response — used to avoid false offline flaps. */
let lastApiOkAt = 0;

export function noteApiSuccess(): void {
  lastApiOkAt = Date.now();
}

export function recentApiSuccess(withinMs = 20_000): boolean {
  return lastApiOkAt > 0 && Date.now() - lastApiOkAt < withinMs;
}

export function apiPlatformHint(): string {
  return `${Platform.OS}${isAndroidEmulator() ? '/emulator' : ''} → ${apiBaseUrl()}`;
}
