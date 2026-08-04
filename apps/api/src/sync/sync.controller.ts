import { Body, Controller, Get, Headers, HttpCode, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { syncPullQuerySchema, syncPushRequestSchema } from '@farm/contracts';
import type {
  SyncPullQuery,
  SyncPullResponse,
  SyncPushRequest,
  SyncPushResponse,
} from '@farm/contracts';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { RequestUser } from '../common/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { SyncService } from './sync.service';

@ApiTags('sync')
@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

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
