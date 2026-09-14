import { Injectable, Logger } from '@nestjs/common';
import type {
  SyncChange,
  SyncMutation,
  SyncMutationResult,
  SyncPullResponse,
  SyncPushRequest,
  SyncPushResponse,
} from '@farm/contracts';
import { AuditService } from '../audit/audit.service';
import type { RequestUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { AnimalApplier } from './animal.applier';

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly animals: AnimalApplier,
  ) {}

  /**
   * Apply a batch of client mutations idempotently.
   * Each mutation runs in its own transaction so one bad record never
   * blocks the rest of the batch; the ledger row and change-log entry
   * commit atomically with the domain write.
   */
  async push(
    user: RequestUser,
    request: SyncPushRequest,
    requestId?: string,
  ): Promise<SyncPushResponse> {
    await this.prisma.device.upsert({
      where: { id: request.deviceId },
      update: { lastSeenAt: new Date(), userId: user.id },
      create: { id: request.deviceId, userId: user.id, platform: 'android' },
    });

    const results: SyncMutationResult[] = [];
    for (const mutation of request.mutations) {
      results.push(await this.applyOne(user, request.deviceId, mutation));
    }

    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'sync.push',
      metadata: {
        deviceId: request.deviceId,
        total: results.length,
        applied: results.filter((r) => r.status === 'applied').length,
        conflicts: results.filter((r) => r.status === 'conflict').length,
        failed: results.filter((r) => r.status === 'failed').length,
      },
      requestId,
    });

    return { results };
  }

  private async applyOne(
    user: RequestUser,
    deviceId: string,
    mutation: SyncMutation,
  ): Promise<SyncMutationResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.syncMutationRecord.findUnique({
          where: { clientMutationId: mutation.clientMutationId },
        });
        if (existing) {
          return {
            clientMutationId: mutation.clientMutationId,
            status: 'duplicate' as const,
            serverVersion: existing.serverVersion ?? undefined,
          };
        }

        const outcome = await this.animals.apply(tx, user, mutation, deviceId);

        if (outcome.status === 'applied') {
          await tx.changeLogEntry.create({
            data: {
              farmId: user.farmId,
              entityType: mutation.entityType,
              entityId: mutation.entityId,
              version: outcome.serverVersion,
              deletedAt: mutation.op === 'delete' ? new Date() : null,
              data: outcome.snapshot as never,
            },
          });
        }

        await tx.syncMutationRecord.create({
          data: {
            clientMutationId: mutation.clientMutationId,
            farmId: user.farmId,
            userId: user.id,
            deviceId,
            entityType: mutation.entityType,
            entityId: mutation.entityId,
            op: mutation.op,
            status:
              outcome.status === 'applied'
                ? 'APPLIED'
                : outcome.status === 'conflict'
                  ? 'CONFLICT'
                  : 'FAILED',
            serverVersion: outcome.status === 'applied' ? outcome.serverVersion : null,
            error: outcome.status === 'failed' ? outcome.error : null,
          },
        });

        if (outcome.status === 'applied') {
          return {
            clientMutationId: mutation.clientMutationId,
            status: 'applied' as const,
            serverVersion: outcome.serverVersion,
          };
        }
        if (outcome.status === 'conflict') {
          return {
            clientMutationId: mutation.clientMutationId,
            status: 'conflict' as const,
            current: outcome.current,
          };
        }
        return {
          clientMutationId: mutation.clientMutationId,
          status: 'failed' as const,
          error: outcome.error,
        };
      });
    } catch (error) {
      this.logger.error(
        `Sync mutation ${mutation.clientMutationId} failed unexpectedly`,
        error as Error,
      );
      return {
        clientMutationId: mutation.clientMutationId,
        status: 'failed',
        error: 'INTERNAL_ERROR',
      };
    }
  }

  /** Incremental, farm-scoped change feed with tombstones. */
  async pull(user: RequestUser, cursor: number, limit: number): Promise<SyncPullResponse> {
    const entries = await this.prisma.changeLogEntry.findMany({
      where: { farmId: user.farmId, seq: { gt: BigInt(cursor) } },
      orderBy: { seq: 'asc' },
      take: limit + 1,
    });

    const hasMore = entries.length > limit;
    const page = hasMore ? entries.slice(0, limit) : entries;
    const changes: SyncChange[] = page.map((e) => ({
      entityType: e.entityType,
      entityId: e.entityId,
      version: e.version,
      deletedAt: e.deletedAt?.toISOString() ?? null,
      data: (e.data as Record<string, unknown> | null) ?? null,
      seq: Number(e.seq),
    }));
    const last = changes[changes.length - 1];

    return {
      changes,
      nextCursor: last ? last.seq : cursor,
      hasMore,
    };
  }
}
