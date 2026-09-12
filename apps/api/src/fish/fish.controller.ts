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
  UseInterceptors,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  fishBatchCreateSchema,
  fishBatchUpdateSchema,
  fishSamplingCreateSchema,
  pageQuerySchema,
  waterQualityCreateSchema,
} from '@farm/contracts';
import type {
  FishBatchCreate,
  FishBatchUpdate,
  FishSamplingCreate,
  PageQuery,
  PageResult,
  WaterQualityCreate,
} from '@farm/contracts';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { DeprecatedEndpointInterceptor } from '../common/deprecated-endpoint.interceptor';
import type { RequestUser } from '../common/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  FishService,
  type FishBatchDto,
  type FishSamplingDto,
  type WaterQualityDto,
} from './fish.service';

/** @deprecated Superseded by /v1/batches?kind=FISH. Removed after one release. */
@ApiTags('fish')
@Controller('fish')
@UseInterceptors(new DeprecatedEndpointInterceptor('/v1/batches?kind=FISH'))
export class FishController {
  constructor(private readonly fish: FishService) {}

  @Get()
  @RequirePermissions('fish:read')
  @ApiOperation({ summary: 'List fish batches' })
  list(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(pageQuerySchema)) query: PageQuery,
  ): Promise<PageResult<FishBatchDto>> {
    return this.fish.list(user, query);
  }

  @Get(':id')
  @RequirePermissions('fish:read')
  @ApiOperation({ summary: 'Get fish batch' })
  get(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<FishBatchDto> {
    return this.fish.get(user, id);
  }

  @Post()
  @RequirePermissions('fish:write')
  @ApiOperation({ summary: 'Create fish batch' })
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(fishBatchCreateSchema)) body: FishBatchCreate,
    @Headers('x-request-id') requestId?: string,
  ): Promise<FishBatchDto> {
    return this.fish.create(user, body, requestId);
  }

  @Patch(':id')
  @RequirePermissions('fish:write')
  @ApiOperation({ summary: 'Update fish batch' })
  update(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(fishBatchUpdateSchema)) body: FishBatchUpdate,
    @Headers('x-request-id') requestId?: string,
  ): Promise<FishBatchDto> {
    return this.fish.update(user, id, body, requestId);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('fish:write')
  @ApiOperation({ summary: 'Soft-delete fish batch' })
  async remove(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<void> {
    await this.fish.remove(user, id, requestId);
  }

  @Post(':id/water-quality')
  @RequirePermissions('fish:write')
  @ApiOperation({ summary: 'Log water quality' })
  addWaterQuality(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(waterQualityCreateSchema)) body: WaterQualityCreate,
    @Headers('x-request-id') requestId?: string,
  ): Promise<WaterQualityDto> {
    return this.fish.addWaterQuality(user, id, body, requestId);
  }

  @Post(':id/sampling')
  @RequirePermissions('fish:write')
  @ApiOperation({ summary: 'Record sampling and update batch averages' })
  addSampling(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(fishSamplingCreateSchema)) body: FishSamplingCreate,
    @Headers('x-request-id') requestId?: string,
  ): Promise<FishSamplingDto> {
    return this.fish.addSampling(user, id, body, requestId);
  }
}
