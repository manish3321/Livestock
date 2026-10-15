import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { ChangeRequest, Prisma, User } from '@prisma/client';
import type {
  ChangeRequestDto,
  ChangeRequestStatus,
  PendingApprovalResponse,
} from '@farm/contracts';
import { AuditService } from '../audit/audit.service';
import { TokenService } from '../auth/token.service';
import type { RequestUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { entityLabel, type ApprovalTarget } from './approval-routes';

/** In-round milk fixes ("change if needed" in the shed) stay direct for this long after recording. */
const MILK_FIX_WINDOW_MS = 12 * 60 * 60 * 1000;

type Row = ChangeRequest & {
  requestedBy: Pick<User, 'id' | 'name'>;
  reviewedBy: Pick<User, 'id' | 'name'> | null;
};

function jsonSafe(value: unknown): Record<string, unknown> | null {
  if (value == null) return null;
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

@Injectable()
export class ChangeRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tokens: TokenService,
    private readonly adapterHost: HttpAdapterHost,
  ) {}

  /** Whether this edit is exempt even for workers (fixing a figure in the round just recorded). */
  async isExempt(user: RequestUser, target: ApprovalTarget, method: string): Promise<boolean> {
    if (target.entityType !== 'milk-entry' || method !== 'PATCH') return false;
    const entry = await this.prisma.productionEntry.findFirst({
      where: { id: target.entityId, farmId: user.farmId },
      select: { createdAt: true, milkRound: { select: { status: true } } },
    });
    if (!entry) return false;
    if (entry.milkRound?.status === 'OPEN') return true;
    return Date.now() - entry.createdAt.getTime() < MILK_FIX_WINDOW_MS;
  }

  async hold(
    user: RequestUser,
    target: ApprovalTarget,
    input: { method: string; url: string; body: unknown; reason?: string },
  ): Promise<PendingApprovalResponse> {
    const delegate = (this.prisma as unknown as Record<string, { findFirst: (args: unknown) => Promise<unknown> }>)[
      target.model
    ];
    const current = delegate
      ? await delegate.findFirst({ where: { id: target.entityId, farmId: user.farmId } }).catch(() => null)
      : null;
    if (!current) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'That record no longer exists' });
    }
    const method = input.method.toUpperCase();
    const body = method === 'DELETE' ? null : jsonSafe(input.body);
    const full = jsonSafe(current) ?? {};
    const before =
      method === 'DELETE' || !body
        ? full
        : Object.fromEntries(Object.keys(body).map((k) => [k, full[k] ?? null]));
    // Keep the label fields so the approval list can name the record.
    for (const key of ['herdNumber', 'tag', 'name', 'title', 'invoiceNumber', 'description', 'animalId']) {
      if (full[key] != null && before[key] === undefined) before[key] = full[key];
    }

    const row = await this.prisma.changeRequest.create({
      data: {
        farmId: user.farmId,
        method,
        path: input.url,
        body: (body ?? undefined) as Prisma.InputJsonValue | undefined,
        entityType: target.entityType,
        entityId: target.entityId,
        before: before as Prisma.InputJsonValue,
        reason: input.reason?.trim().slice(0, 500) || null,
        requestedById: user.id,
      },
    });
    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'change.request',
      entityType: target.entityType,
      entityId: target.entityId,
      metadata: { changeRequestId: row.id, method },
    });
    return {
      pendingApproval: true,
      changeRequestId: row.id,
      message: 'Sent to admin for approval',
    };
  }

  async list(
    user: RequestUser,
    query: { status?: string; mine?: boolean },
  ): Promise<ChangeRequestDto[]> {
    const approver = user.permissions.includes('changes:approve');
    const status = (query.status?.toUpperCase() || undefined) as ChangeRequestStatus | 'ALL' | undefined;
    const rows = await this.prisma.changeRequest.findMany({
      where: {
        farmId: user.farmId,
        ...(approver && !query.mine ? {} : { requestedById: user.id }),
        ...(status && status !== 'ALL' ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        requestedBy: { select: { id: true, name: true } },
        reviewedBy: { select: { id: true, name: true } },
      },
    });
    return rows.map(toDto);
  }

  pendingCount(user: RequestUser): Promise<number> {
    return this.prisma.changeRequest.count({ where: { farmId: user.farmId, status: 'PENDING' } });
  }

  async approve(user: RequestUser, id: string, note?: string): Promise<ChangeRequestDto> {
    const row = await this.claimPending(user, id, 'APPROVED', note);
    const outcome = await this.replay(user, row);
    const updated = await this.prisma.changeRequest.update({
      where: { id },
      data: outcome.ok ? { error: null } : { status: 'FAILED', error: outcome.error },
      include: {
        requestedBy: { select: { id: true, name: true } },
        reviewedBy: { select: { id: true, name: true } },
      },
    });
    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: outcome.ok ? 'change.approve' : 'change.approve_failed',
      entityType: row.entityType,
      entityId: row.entityId ?? undefined,
      metadata: { changeRequestId: id, requestedById: row.requestedById, error: outcome.ok ? undefined : outcome.error },
    });
    return toDto(updated);
  }

  async reject(user: RequestUser, id: string, note?: string): Promise<ChangeRequestDto> {
    const row = await this.claimPending(user, id, 'REJECTED', note);
    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'change.reject',
      entityType: row.entityType,
      entityId: row.entityId ?? undefined,
      metadata: { changeRequestId: id, requestedById: row.requestedById, note },
    });
    return this.get(user, id);
  }

  async cancel(user: RequestUser, id: string): Promise<ChangeRequestDto> {
    const row = await this.prisma.changeRequest.findFirst({ where: { id, farmId: user.farmId } });
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Change request not found' });
    if (row.requestedById !== user.id) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Only the person who asked can cancel it' });
    }
    const done = await this.prisma.changeRequest.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });
    if (done.count === 0) {
      throw new ConflictException({ code: 'NOT_PENDING', message: 'This request was already reviewed' });
    }
    return this.get(user, id);
  }

  private async get(user: RequestUser, id: string): Promise<ChangeRequestDto> {
    const row = await this.prisma.changeRequest.findFirst({
      where: { id, farmId: user.farmId },
      include: {
        requestedBy: { select: { id: true, name: true } },
        reviewedBy: { select: { id: true, name: true } },
      },
    });
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Change request not found' });
    return toDto(row);
  }

  /** Flip PENDING → decision atomically so two reviewers can't both act on it. */
  private async claimPending(
    user: RequestUser,
    id: string,
    status: 'APPROVED' | 'REJECTED',
    note?: string,
  ): Promise<ChangeRequest> {
    const done = await this.prisma.changeRequest.updateMany({
      where: { id, farmId: user.farmId, status: 'PENDING' },
      data: { status, reviewedById: user.id, reviewedAt: new Date(), reviewNote: note?.trim() || null },
    });
    if (done.count === 0) {
      const exists = await this.prisma.changeRequest.findFirst({ where: { id, farmId: user.farmId } });
      if (!exists) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Change request not found' });
      throw new ConflictException({ code: 'NOT_PENDING', message: 'This request was already reviewed' });
    }
    return (await this.prisma.changeRequest.findUnique({ where: { id } }))!;
  }

  /**
   * Re-sends the original request as the approver through the app itself, so the
   * normal route, validation, permissions and audit all apply.
   */
  private async replay(user: RequestUser, row: ChangeRequest): Promise<{ ok: true } | { ok: false; error: string }> {
    const { token } = this.tokens.signAccessToken({
      sub: user.id,
      email: user.email,
      farmId: user.farmId,
      role: user.role,
      sessionId: user.sessionId,
    });
    const server = createServer(this.adapterHost.httpAdapter.getInstance());
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => resolve());
      });
      const { port } = server.address() as AddressInfo;
      const res = await fetch(`http://127.0.0.1:${port}${row.path}`, {
        method: row.method,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          'x-change-request-id': row.id,
        },
        body: row.body == null ? undefined : JSON.stringify(row.body),
      });
      if (res.ok) return { ok: true };
      let message = `HTTP ${res.status}`;
      try {
        const err = (await res.json()) as { message?: unknown };
        if (typeof err.message === 'string') message = err.message;
      } catch {
        /* keep status */
      }
      return { ok: false, error: message.slice(0, 500) };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Replay failed' };
    } finally {
      server.close();
    }
  }
}

function toDto(row: Row): ChangeRequestDto {
  const before = (row.before as Record<string, unknown> | null) ?? null;
  return {
    id: row.id,
    method: row.method as ChangeRequestDto['method'],
    path: row.path,
    entityType: row.entityType,
    entityId: row.entityId,
    entityLabel: entityLabel(before),
    changes: (row.body as Record<string, unknown> | null) ?? {},
    before,
    reason: row.reason,
    status: row.status,
    requestedBy: row.requestedBy,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    reviewNote: row.reviewNote,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
  };
}
