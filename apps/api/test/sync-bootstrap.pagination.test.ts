import './setup-env';
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { ROLE_PERMISSIONS } from '@farm/contracts';
import type { RequestUser } from '../src/common/types';
import { MAX_BOOTSTRAP_PAGES, SyncBootstrapService } from '../src/sync/sync-bootstrap.service';

function owner(): RequestUser {
  return {
    id: randomUUID(),
    email: 'owner@farm.local',
    farmId: randomUUID(),
    role: 'ADMIN',
    sessionId: randomUUID(),
    permissions: ROLE_PERMISSIONS.ADMIN,
  };
}

const rows = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => ({ id: `r${from + i}` }));

/** list() that serves `total` rows by the requested page/pageSize. */
function pagedList(total: number) {
  return vi.fn(async (_user: unknown, q: { page: number; pageSize: number }) => {
    const start = (q.page - 1) * q.pageSize;
    const count = Math.max(0, Math.min(q.pageSize, total - start));
    return { items: rows(start, count), page: q.page, pageSize: q.pageSize, total };
  });
}

function makeService(lists: Record<string, ReturnType<typeof vi.fn>>) {
  const empty = { list: vi.fn(async () => ({ items: [], page: 1, pageSize: 100, total: 0 })) };
  const svc = new SyncBootstrapService(
    { auditEvent: { findMany: vi.fn(async () => []), count: vi.fn(async () => 0) } } as any,
    { summary: vi.fn(async () => ({})) } as any,
    { list: lists.animals ?? empty.list, cohort: vi.fn(async () => ({})) } as any,
    { list: lists.batches ?? empty.list } as any,
    { list: lists.expenses ?? empty.list } as any,
    { list: lists.revenue ?? empty.list } as any,
    { list: lists.inventory ?? empty.list } as any,
    { list: lists.health ?? empty.list } as any,
    { list: lists.breeding ?? empty.list } as any,
    { list: lists.production ?? empty.list } as any,
    { list: lists.feed ?? empty.list } as any,
    { get: vi.fn(async () => ({})) } as any,
    { farmOverview: vi.fn(async () => ({})) } as any,
    { list: vi.fn(async () => []) } as any,
    { list: lists.tasks ?? empty.list } as any,
  );
  return svc;
}

describe('sync bootstrap pagination', () => {
  it('requests page 2 when total > 100 and merges items', async () => {
    const animals = pagedList(150);
    const tasks = pagedList(150);
    const svc = makeService({ animals, tasks });

    const snap = await svc.snapshot(owner());

    expect(animals).toHaveBeenCalledTimes(2);
    expect(animals.mock.calls.map((c) => c[1].page)).toEqual([1, 2]);
    const a = snap.modules.animals as any;
    expect(a.items).toHaveLength(150);
    expect(a.items[0].id).toBe('r0');
    expect(a.items[149].id).toBe('r149');
    expect(a.total).toBe(150);
    expect(a.page).toBe(1);
    expect(a.pageSize).toBe(150);

    expect(tasks).toHaveBeenCalledTimes(2);
    expect(tasks.mock.calls[1]?.[1]).toMatchObject({ page: 2, pageSize: 100 });
    expect((snap.modules.tasks as any).items).toHaveLength(150);
  });

  it('does not fetch a second page when page 1 holds everything', async () => {
    const feed = pagedList(40);
    const snap = await makeService({ feed }).snapshot(owner());
    expect(feed).toHaveBeenCalledTimes(1);
    expect((snap.modules.feed as any).items).toHaveLength(40);
  });

  it('does not fetch an extra page when total is an exact multiple of the page size', async () => {
    const batches = pagedList(200);
    await makeService({ batches }).snapshot(owner());
    // batches feeds batches + groups + fish; each walks 2 pages and stops at total.
    expect(batches).toHaveBeenCalledTimes(6);
  });

  it('caps a module at 20 pages and warns', async () => {
    const expenses = pagedList(100 * 50);
    const svc = makeService({ expenses });
    const warn = vi.spyOn((svc as any).log, 'warn').mockImplementation(() => undefined);

    const snap = await svc.snapshot(owner());

    expect(expenses).toHaveBeenCalledTimes(MAX_BOOTSTRAP_PAGES);
    expect((snap.modules.expenses as any).items).toHaveLength(MAX_BOOTSTRAP_PAGES * 100);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('expenses hit 20-page cap'));
  });
});
