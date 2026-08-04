import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  revenueCreateSchema,
  revenueListQuerySchema,
  revenueUpdateSchema,
} from '@farm/contracts';
import type {
  PageResult,
  RevenueCreate,
  RevenueListQuery,
  RevenueUpdate,
} from '@farm/contracts';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { RequestUser } from '../common/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { RevenueService, type RevenueDto } from './revenue.service';

@ApiTags('revenue')
@Controller('revenue')
export class RevenueController {
  constructor(private readonly revenue: RevenueService) {}

  @Get()
  @RequirePermissions('revenue:read')
  @ApiOperation({ summary: 'List revenue entries' })
  list(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(revenueListQuerySchema)) query: RevenueListQuery,
  ): Promise<PageResult<RevenueDto>> {
    return this.revenue.list(user, query);
  }

  @Get(':id')
  @RequirePermissions('revenue:read')
  @ApiOperation({ summary: 'Get revenue entry' })
  get(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RevenueDto> {
    return this.revenue.get(user, id);
  }

  @Post()
  @RequirePermissions('revenue:write')
  @ApiOperation({ summary: 'Create revenue entry' })
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(revenueCreateSchema)) body: RevenueCreate,
    @Headers('x-request-id') requestId?: string,
  ): Promise<RevenueDto> {
    return this.revenue.create(user, body, requestId);
  }

  @Patch(':id')
  @RequirePermissions('revenue:write')
  @ApiOperation({ summary: 'Update revenue entry' })
  update(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(revenueUpdateSchema)) body: RevenueUpdate,
    @Headers('x-request-id') requestId?: string,
  ): Promise<RevenueDto> {
    return this.revenue.update(user, id, body, requestId);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('revenue:write')
  @ApiOperation({ summary: 'Delete revenue entry' })
  async remove(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<void> {
    await this.revenue.remove(user, id, requestId);
  }
}
