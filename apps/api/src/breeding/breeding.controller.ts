import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  breedingCreateSchema,
  breedingListQuerySchema,
  breedingUpdateSchema,
} from '@farm/contracts';
import type {
  BreedingCreate,
  BreedingListQuery,
  BreedingUpdate,
  PageResult,
} from '@farm/contracts';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { RequestUser } from '../common/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { BreedingService, type BreedingRecordDto } from './breeding.service';

@ApiTags('breeding')
@Controller('breeding')
export class BreedingController {
  constructor(private readonly breeding: BreedingService) {}

  @Get()
  @RequirePermissions('breeding:read')
  @ApiOperation({ summary: 'List breeding records' })
  list(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(breedingListQuerySchema)) query: BreedingListQuery,
  ): Promise<PageResult<BreedingRecordDto>> {
    return this.breeding.list(user, query);
  }

  @Post()
  @RequirePermissions('breeding:write')
  @ApiOperation({ summary: 'Create breeding record (due date from gestation)' })
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(breedingCreateSchema)) body: BreedingCreate,
    @Headers('x-request-id') requestId?: string,
  ): Promise<BreedingRecordDto> {
    return this.breeding.create(user, body, requestId);
  }

  @Patch(':id')
  @RequirePermissions('breeding:write')
  @ApiOperation({ summary: 'Update breeding status / birth / offspring' })
  update(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(breedingUpdateSchema)) body: BreedingUpdate,
    @Headers('x-request-id') requestId?: string,
  ): Promise<BreedingRecordDto> {
    return this.breeding.update(user, id, body, requestId);
  }
}
