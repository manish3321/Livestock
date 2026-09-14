import './setup-env';
import { randomUUID } from 'node:crypto';
import { ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';
import { ROLE_PERMISSIONS } from '@farm/contracts';
import type { RequestUser } from '../src/common/types';
import { ExpensesService } from '../src/expenses/expenses.service';
import { fakeAudit } from './fakes';

const FARM = randomUUID();

function actor(role: 'MANAGER' | 'ADMIN'): RequestUser {
  return {
    id: randomUUID(),
    email: `${role.toLowerCase()}@farm.local`,
    farmId: FARM,
    role,
    sessionId: randomUUID(),
    permissions: ROLE_PERMISSIONS[role],
  };
}

describe('expenses.review', () => {
  const expenses: any[] = [];
  let service: ExpensesService;

  beforeEach(() => {
    expenses.length = 0;
    const prisma: any = {
      expense: {
        findFirst: async ({ where }: any) =>
          expenses.find((e) => e.id === where.id && e.farmId === where.farmId) ?? null,
        update: async ({ where, data }: any) => {
          const row = expenses.find((e) => e.id === where.id);
          Object.assign(row, data);
          return { ...row, allocations: [] };
        },
      },
    };
    service = new ExpensesService(prisma, fakeAudit);
  });

  it('lets a manager approve under-threshold spending and blocks the owner-only queue', async () => {
    const pendingId = randomUUID();
    const escalatedId = randomUUID();
    expenses.push(
      {
        id: pendingId,
        farmId: FARM,
        status: 'PENDING',
        category: 'FEED',
        amount: 1000,
        expenseDate: new Date(),
        description: 'dana',
        receiptNumber: null,
        receiptUrl: null,
        gstAmount: null,
        supplier: null,
        paymentStatus: 'UNPAID',
        submittedById: randomUUID(),
        reviewedById: null,
        reviewedAt: null,
        reviewNote: null,
        animalId: null,
        herdBatchId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: escalatedId,
        farmId: FARM,
        status: 'ESCALATED',
        category: 'FEED',
        amount: 60000,
        expenseDate: new Date(),
        description: 'truck of dana',
        receiptNumber: null,
        receiptUrl: null,
        gstAmount: null,
        supplier: null,
        paymentStatus: 'UNPAID',
        submittedById: randomUUID(),
        reviewedById: null,
        reviewedAt: null,
        reviewNote: null,
        animalId: null,
        herdBatchId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    );
    const manager = actor('MANAGER');
    const approved = await service.review(manager, pendingId, { decision: 'APPROVE' });
    expect(approved.status).toBe('APPROVED');
    await expect(service.review(manager, escalatedId, { decision: 'APPROVE' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    const owner = actor('ADMIN');
    const escalated = await service.review(owner, escalatedId, { decision: 'APPROVE' });
    expect(escalated.status).toBe('APPROVED');
  });
});
