import { describe, expect, it, vi } from 'vitest';
import { fetchAllPages } from '../src/offline/module-cache';

describe('fetchAllPages', () => {
  it('walks page 2 when total > pageSize and merges items', async () => {
    const get = vi.fn(async (path: string) => {
      const page = Number(/page=(\d+)/.exec(path)![1]);
      const count = page === 1 ? 100 : 50;
      return {
        items: Array.from({ length: count }, (_, i) => ({ id: (page - 1) * 100 + i })),
        page,
        pageSize: 100,
        total: 150,
      };
    });
    const out: any = await fetchAllPages({ get } as any, '/v1/animals?page=1&pageSize=100&sort=tag');
    expect(get.mock.calls.map((c) => c[0])).toEqual([
      '/v1/animals?page=1&pageSize=100&sort=tag',
      '/v1/animals?page=2&pageSize=100&sort=tag',
    ]);
    expect(out.items).toHaveLength(150);
    expect(out.total).toBe(150);
    expect(out.page).toBe(1);
  });
});
