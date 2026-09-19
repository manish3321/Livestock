import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createHttpFarmApi } from '../src/api/http-farm-api';

describe('http farm api', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('posts login and invokes onTokens', async () => {
    const onTokens = vi.fn();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          accessToken: 'a',
          refreshToken: 'r',
          expiresIn: 900,
          user: { id: 'u1', email: 'w@farm.local', role: 'WORKER' },
        }),
    });

    const api = createHttpFarmApi({
      getAccessToken: () => null,
      getRefreshToken: () => null,
      onTokens,
      onAuthFailure: vi.fn(),
    });

    const res = await api.login('w@farm.local', 'ChangeMe123!', 'android-1');
    expect(res.accessToken).toBe('a');
    expect(onTokens).toHaveBeenCalled();
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/v1/auth/login');
  });

  it('builds list animals URL with pageSize 200', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ items: [], page: 1, pageSize: 200, total: 0 }),
    });
    const api = createHttpFarmApi({
      getAccessToken: () => 'tok',
      getRefreshToken: () => null,
      onTokens: vi.fn(),
      onAuthFailure: vi.fn(),
    });
    await api.listAnimals(2, 'tok');
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/v1/animals?page=2&pageSize=200');
  });
});
