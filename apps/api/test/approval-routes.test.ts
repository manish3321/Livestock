import { describe, expect, it } from 'vitest';
import { approvalTarget, entityLabel } from '../src/change-requests/approval-routes';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

describe('approvalTarget', () => {
  it('holds edits and deletes of farm records', () => {
    expect(approvalTarget('PATCH', `/v1/animals/${A}`)).toEqual({ entityType: 'animal', entityId: A, model: 'animal' });
    expect(approvalTarget('DELETE', `/v1/health-records/${A}`)?.entityType).toBe('health-record');
    expect(approvalTarget('PATCH', `/v1/milk/${A}?x=1`)?.model).toBe('productionEntry');
    expect(approvalTarget('PATCH', `/v1/breeding/heat/${A}`)?.model).toBe('heatLog');
    expect(approvalTarget('PATCH', `/v1/breeding/${A}`)?.model).toBe('breedingRecord');
  });

  it('targets the weight, not the animal, for weight deletes', () => {
    expect(approvalTarget('DELETE', `/v1/animals/${A}/weights/${B}`)).toEqual({
      entityType: 'weight',
      entityId: B,
      model: 'weightRecord',
    });
  });

  it('leaves creates, workflow actions and settings alone', () => {
    expect(approvalTarget('POST', `/v1/animals/${A}`)).toBeNull();
    expect(approvalTarget('GET', `/v1/animals/${A}`)).toBeNull();
    expect(approvalTarget('PATCH', `/v1/tasks/${A}/complete`)).toBeNull();
    expect(approvalTarget('PATCH', `/v1/milk/rounds/${A}/tank`)).toBeNull();
    expect(approvalTarget('PATCH', '/v1/auth/me')).toBeNull();
    expect(approvalTarget('PATCH', '/v1/farms/me')).toBeNull();
  });
});

describe('entityLabel', () => {
  it('prefers the herd number, then tag, name, title', () => {
    expect(entityLabel({ herdNumber: 'B12', tag: 'BUF012' })).toBe('B12');
    expect(entityLabel({ title: 'FMD booster' })).toBe('FMD booster');
    expect(entityLabel(null)).toBeNull();
  });
});
