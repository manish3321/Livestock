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
  batchIllnessCreateSchema,
  batchMortalityCreateSchema,
  herdBatchCreateSchema,
  herdBatchListQuerySchema,
  herdBatchUpdateSchema,
} from '@farm/contracts';
import type {
  BatchIllnessCreate,
  BatchMortalityCreate,
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
  type HerdBatchDto,
  type IllnessDto,
  type MortalityDto,
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
}
