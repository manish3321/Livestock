import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { syncPushRequestSchema, syncPullQuerySchema } from '../src/sync';

describe('sync contracts', () => {
  it('accepts a valid push batch', () => {
    const parsed = syncPushRequestSchema.parse({
      deviceId: 'device-1234',
      mutations: [
        {
          clientMutationId: randomUUID(),
          entityType: 'animal',
          entityId: randomUUID(),
          op: 'create',
          payload: { tag: 'BUF001', species: 'BUFFALO' },
          occurredAt: new Date().toISOString(),
        },
      ],
    });
    expect(parsed.mutations).toHaveLength(1);
    expect(parsed.mutations[0]?.occurredAt).toBeInstanceOf(Date);
  });

  it('rejects unknown entity types and bad mutation ids', () => {
    expect(() =>
      syncPushRequestSchema.parse({
        deviceId: 'device-1234',
        mutations: [
          {
            clientMutationId: 'not-a-uuid',
            entityType: 'animal',
            entityId: randomUUID(),
            op: 'create',
            occurredAt: new Date().toISOString(),
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      syncPushRequestSchema.parse({
        deviceId: 'device-1234',
        mutations: [
          {
            clientMutationId: randomUUID(),
            entityType: 'tractor',
            entityId: randomUUID(),
            op: 'create',
            occurredAt: new Date().toISOString(),
          },
        ],
      }),
    ).toThrow();
  });

  it('rejects oversized batches', () => {
    const mutation = {
      clientMutationId: randomUUID(),
      entityType: 'animal',
      entityId: randomUUID(),
      op: 'update' as const,
      payload: {},
      baseVersion: 1,
      occurredAt: new Date().toISOString(),
    };
    expect(() =>
      syncPushRequestSchema.parse({
        deviceId: 'device-1234',
        mutations: Array.from({ length: 201 }, () => ({
          ...mutation,
          clientMutationId: randomUUID(),
        })),
      }),
    ).toThrow();
  });

  it('defaults pull cursor to 0', () => {
    expect(syncPullQuerySchema.parse({})).toEqual({ cursor: 0, limit: 200 });
  });
});
