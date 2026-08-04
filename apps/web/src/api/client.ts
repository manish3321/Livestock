import type { ApiError, LoginResponse, TokenPair } from '@farm/contracts';

/**
 * Fetch wrapper with JWT access tokens and transparent refresh rotation.
 * Tokens live in localStorage; a 401 triggers one refresh attempt and a
 * replay of the original request.
 */

const ACCESS_KEY = 'farm.accessToken';
const REFRESH_KEY = 'farm.refreshToken';

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY);
}

export function storeTokens(tokens: TokenPair): void {
  localStorage.setItem(ACCESS_KEY, tokens.accessToken);
  localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export class ApiRequestError extends Error {
  constructor(public readonly error: ApiError) {
    super(error.message);
    this.name = 'ApiRequestError';
  }
}

let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  refreshPromise ??= (async () => {
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    if (!refreshToken) return false;
    try {
      const res = await fetch('/v1/auth/refresh', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        clearTokens();
        return false;
      }
      storeTokens((await res.json()) as TokenPair);
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

export async function api<T>(
  path: string,
  init: RequestInit = {},
  retried = false,
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  const token = getAccessToken();
  if (token) headers.set('authorization', `Bearer ${token}`);

  const res = await fetch(path, { ...init, headers });

  if (res.status === 401 && !retried && (await tryRefresh())) {
    return api<T>(path, init, true);
  }

  if (!res.ok) {
    let error: ApiError;
    try {
      error = (await res.json()) as ApiError;
    } catch {
      error = { statusCode: res.status, code: 'HTTP_ERROR', message: res.statusText };
    }
    throw new ApiRequestError(error);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const response = await api<LoginResponse>('/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password, platform: 'web' }),
  });
  storeTokens(response);
  return response;
}

export async function logout(): Promise<void> {
  try {
    await api('/v1/auth/logout', { method: 'POST' });
  } finally {
    clearTokens();
  }
}
