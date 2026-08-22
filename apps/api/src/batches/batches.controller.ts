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
  batchFeedCreateSchema,
  batchHarvestCreateSchema,
  batchIllnessCreateSchema,
  batchMortalityCreateSchema,
  batchSamplingCreateSchema,
  batchWaterQualityCreateSchema,
  herdBatchCreateSchema,
  herdBatchListQuerySchema,
  herdBatchUpdateSchema,
} from '@farm/contracts';
import type {
  BatchEconomicsDto,
  BatchFeedCreate,
  BatchHarvestCreate,
  BatchIllnessCreate,
  BatchMortalityCreate,
  BatchSamplingCreate,
  BatchWaterQualityCreate,
  HerdBatchCreate,
  HerdBatchListQuery,
  HerdBatchUpdate,
  PageResult,
} from '@farm/contracts';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { RequestUser } from '../common/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  BatchesService,
  type FeedDto,
  type HarvestDto,
  type HerdBatchDto,
  type IllnessDto,
  type MortalityDto,
  type SamplingDto,
  type WaterQualityDto,
} from './batches.service';

@ApiTags('batches')
@Controller('batches')
export class BatchesController {
  constructor(private readonly batches: BatchesService) {}

  @Get()
  @RequirePermissions('animals:read')
  @ApiOperation({ summary: 'List herd batches' })
  list(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(herdBatchListQuerySchema)) query: HerdBatchListQuery,
  ): Promise<PageResult<HerdBatchDto>> {
    return this.batches.list(user, query);
  }

  @Get(':id')
  @RequirePermissions('animals:read')
  @ApiOperation({ summary: 'Get herd batch' })
  get(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<HerdBatchDto> {
    return this.batches.get(user, id);
  }

  @Get(':id/economics')
  @RequirePermissions('animals:read')
  @ApiOperation({ summary: 'Invested vs earned summary for a batch (shed/pond QR)' })
  economics(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BatchEconomicsDto> {
    return this.batches.economics(user, id);
  }

  @Post()
  @RequirePermissions('animals:write')
  @ApiOperation({ summary: 'Create herd batch' })
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(herdBatchCreateSchema)) body: HerdBatchCreate,
    @Headers('x-request-id') requestId?: string,
  ): Promise<HerdBatchDto> {
    return this.batches.create(user, body, requestId);
  }

  @Patch(':id')
  @RequirePermissions('animals:write')
  @ApiOperation({ summary: 'Update herd batch' })
  update(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(herdBatchUpdateSchema)) body: HerdBatchUpdate,
    @Headers('x-request-id') requestId?: string,
  ): Promise<HerdBatchDto> {
    return this.batches.update(user, id, body, requestId);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('animals:delete')
  @ApiOperation({ summary: 'Soft-delete herd batch' })
  async remove(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<void> {
    await this.batches.remove(user, id, requestId);
  }

  @Get(':id/illness')
  @RequirePermissions('animals:read')
  @ApiOperation({ summary: 'List illness events for a batch' })
  listIllness(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<IllnessDto[]> {
    return this.batches.listIllness(user, id);
  }

  @Post(':id/illness')
  @RequirePermissions('animals:write')
  @ApiOperation({ summary: 'Log sickness in a batch' })
  addIllness(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(batchIllnessCreateSchema)) body: BatchIllnessCreate,
    @Headers('x-request-id') requestId?: string,
  ): Promise<IllnessDto> {
    return this.batches.addIllness(user, id, body, requestId);
  }

  @Get(':id/mortality')
  @RequirePermissions('animals:read')
  @ApiOperation({ summary: 'List mortality events for a batch' })
  listMortality(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MortalityDto[]> {
    return this.batches.listMortality(user, id);
  }

  @Post(':id/mortality')
  @RequirePermissions('animals:write')
  @ApiOperation({ summary: 'Log deaths in a batch' })
  addMortality(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(batchMortalityCreateSchema)) body: BatchMortalityCreate,
    @Headers('x-request-id') requestId?: string,
  ): Promise<MortalityDto> {
    return this.batches.addMortality(user, id, body, requestId);
  }

  @Get(':id/water-quality')
  @RequirePermissions('animals:read')
  @ApiOperation({ summary: 'List water quality logs for a FISH batch' })
  listWaterQuality(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<WaterQualityDto[]> {
    return this.batches.listWaterQuality(user, id);
  }

  @Post(':id/water-quality')
  @RequirePermissions('animals:write')
  @ApiOperation({ summary: 'Log water quality for a FISH batch' })
  addWaterQuality(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(batchWaterQualityCreateSchema))
    body: BatchWaterQualityCreate,
    @Headers('x-request-id') requestId?: string,
  ): Promise<WaterQualityDto> {
    return this.batches.addWaterQuality(user, id, body, requestId);
  }

  @Get(':id/sampling')
  @RequirePermissions('animals:read')
  @ApiOperation({ summary: 'List sampling events for a FISH batch' })
  listSampling(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SamplingDto[]> {
    return this.batches.listSampling(user, id);
  }

  @Post(':id/sampling')
  @RequirePermissions('animals:write')
  @ApiOperation({ summary: 'Log sampling for a FISH batch' })
  addSampling(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(batchSamplingCreateSchema)) body: BatchSamplingCreate,
    @Headers('x-request-id') requestId?: string,
  ): Promise<SamplingDto> {
    return this.batches.addSampling(user, id, body, requestId);
  }

  @Get(':id/harvest')
  @RequirePermissions('animals:read')
  @ApiOperation({ summary: 'List harvest events for a FISH batch' })
  listHarvest(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<HarvestDto[]> {
    return this.batches.listHarvest(user, id);
  }

  @Post(':id/harvest')
  @RequirePermissions('animals:write')
  @ApiOperation({ summary: 'Log harvest for a FISH batch' })
  addHarvest(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(batchHarvestCreateSchema)) body: BatchHarvestCreate,
    @Headers('x-request-id') requestId?: string,
  ): Promise<HarvestDto> {
    return this.batches.addHarvest(user, id, body, requestId);
  }

  @Get(':id/feed')
  @RequirePermissions('animals:read')
  @ApiOperation({ summary: 'List feed events for a batch' })
  listFeed(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<FeedDto[]> {
    return this.batches.listFeed(user, id);
  }

  @Post(':id/feed')
  @RequirePermissions('animals:write')
  @ApiOperation({ summary: 'Log feed for a batch' })
  addFeed(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(batchFeedCreateSchema)) body: BatchFeedCreate,
    @Headers('x-request-id') requestId?: string,
  ): Promise<FeedDto> {
    return this.batches.addFeed(user, id, body, requestId);
  }
}
