import { Body, Controller, Get, Headers, HttpCode, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { syncPullQuerySchema, syncPushRequestSchema } from '@farm/contracts';
import type {
  SyncBootstrapResponse,
  SyncPullQuery,
  SyncPullResponse,
  SyncPushRequest,
  SyncPushResponse,
} from '@farm/contracts';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { RequestUser } from '../common/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { SyncBootstrapService } from './sync-bootstrap.service';
import { SyncService } from './sync.service';

@ApiTags('sync')
@Controller('sync')
export class SyncController {
  constructor(
    private readonly sync: SyncService,
    private readonly bootstrap: SyncBootstrapService,
  ) {}

  @Get('bootstrap')
  @RequirePermissions('sync:use')
  @ApiOperation({
    summary: 'Offline module snapshot (one response instead of ~18 list GETs)',
  })
  snapshot(@CurrentUser() user: RequestUser): Promise<SyncBootstrapResponse> {
    return this.bootstrap.snapshot(user);
  }

  @Post('push')
  @HttpCode(200)
  @RequirePermissions('sync:use')
  @ApiOperation({ summary: 'Apply a batch of offline mutations idempotently' })
  push(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(syncPushRequestSchema)) body: SyncPushRequest,
    @Headers('x-request-id') requestId?: string,
  ): Promise<SyncPushResponse> {
    return this.sync.push(user, body, requestId);
  }

  @Get('pull')
  @RequirePermissions('sync:use')
  @ApiOperation({ summary: 'Incremental change feed (cursor-based, with tombstones)' })
  pull(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(syncPullQuerySchema)) query: SyncPullQuery,
  ): Promise<SyncPullResponse> {
    return this.sync.pull(user, query.cursor, query.limit);
  }
}
