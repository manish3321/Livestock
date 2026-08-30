import { Body, Controller, Get, Headers, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { feedCreateSchema, feedListQuerySchema } from '@farm/contracts';
import type { FeedCreate, FeedListQuery, PageResult } from '@farm/contracts';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { RequestUser } from '../common/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { FeedService, type FeedFcrDto, type FeedLogDto } from './feed.service';

@ApiTags('feed')
@Controller('feed')
export class FeedController {
  constructor(private readonly feed: FeedService) {}

  @Get()
  @RequirePermissions('feed:read')
  @ApiOperation({ summary: 'List feed logs' })
  list(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(feedListQuerySchema)) query: FeedListQuery,
  ): Promise<PageResult<FeedLogDto>> {
    return this.feed.list(user, query);
  }

  @Get('fcr')
  @RequirePermissions('feed:read')
  @ApiOperation({ summary: 'This-month FCR and Nepal season forage warning' })
  fcr(@CurrentUser() user: RequestUser): Promise<FeedFcrDto> {
    return this.feed.fcr(user);
  }

  @Post()
  @RequirePermissions('feed:write')
  @ApiOperation({ summary: 'Log feed for an animal or batch' })
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(feedCreateSchema)) body: FeedCreate,
    @Headers('x-request-id') requestId?: string,
  ): Promise<FeedLogDto> {
    return this.feed.create(user, body, requestId);
  }
}
