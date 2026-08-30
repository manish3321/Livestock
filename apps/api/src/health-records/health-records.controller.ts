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
  healthCalendarQuerySchema,
  healthCreateSchema,
  healthListQuerySchema,
} from '@farm/contracts';
import type {
  HealthCalendarQuery,
  HealthCreate,
  HealthListQuery,
  PageResult,
} from '@farm/contracts';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { RequestUser } from '../common/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { HealthRecordsService, type HealthRecordDto } from './health-records.service';

@ApiTags('health-records')
@Controller('health-records')
export class HealthRecordsController {
  constructor(private readonly health: HealthRecordsService) {}

  @Get()
  @RequirePermissions('health:read')
  @ApiOperation({ summary: 'List health records' })
  list(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(healthListQuerySchema)) query: HealthListQuery,
  ): Promise<PageResult<HealthRecordDto>> {
    return this.health.list(user, query);
  }

  @Get('calendar')
  @RequirePermissions('health:read')
  @ApiOperation({ summary: 'Preventive calendar — due health events in a date range' })
  calendar(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(healthCalendarQuerySchema)) query: HealthCalendarQuery,
  ): Promise<HealthRecordDto[]> {
    return this.health.calendar(user, query);
  }

  @Get(':id')
  @RequirePermissions('health:read')
  @ApiOperation({ summary: 'Get health record' })
  get(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<HealthRecordDto> {
    return this.health.get(user, id);
  }

  @Post()
  @RequirePermissions('health:write')
  @ApiOperation({ summary: 'Create health record' })
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(healthCreateSchema)) body: HealthCreate,
    @Headers('x-request-id') requestId?: string,
  ): Promise<HealthRecordDto> {
    return this.health.create(user, body, requestId);
  }

  @Patch(':id')
  @RequirePermissions('health:write')
  @ApiOperation({ summary: 'Update health record' })
  update(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(healthCreateSchema.partial())) body: Partial<HealthCreate>,
    @Headers('x-request-id') requestId?: string,
  ): Promise<HealthRecordDto> {
    return this.health.update(user, id, body, requestId);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('health:write')
  @ApiOperation({ summary: 'Delete health record' })
  async remove(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<void> {
    await this.health.remove(user, id, requestId);
  }
}
