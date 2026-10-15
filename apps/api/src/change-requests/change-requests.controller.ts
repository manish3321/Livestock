import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { changeRequestReviewSchema, type ChangeRequestReview } from '@farm/contracts';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { RequestUser } from '../common/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ChangeRequestsService } from './change-requests.service';

@ApiTags('change-requests')
@Controller('change-requests')
export class ChangeRequestsController {
  constructor(private readonly changes: ChangeRequestsService) {}

  @Get()
  @ApiOperation({ summary: 'Approvers see the whole farm (or only theirs with mine=1); others see their own.' })
  list(
    @CurrentUser() user: RequestUser,
    @Query('status') status?: string,
    @Query('mine') mine?: string,
  ) {
    return this.changes.list(user, { status, mine: mine === '1' || mine === 'true' });
  }

  @Get('pending-count')
  async pendingCount(@CurrentUser() user: RequestUser) {
    return { count: await this.changes.pendingCount(user) };
  }

  @Post(':id/approve')
  @RequirePermissions('changes:approve')
  approve(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(changeRequestReviewSchema)) body: ChangeRequestReview,
  ) {
    return this.changes.approve(user, id, body.note);
  }

  @Post(':id/reject')
  @RequirePermissions('changes:approve')
  reject(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(changeRequestReviewSchema)) body: ChangeRequestReview,
  ) {
    return this.changes.reject(user, id, body.note);
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.changes.cancel(user, id);
  }
}
