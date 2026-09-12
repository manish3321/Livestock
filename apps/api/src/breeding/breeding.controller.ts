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
  calvingSchema,
  colostrumSchema,
  heatCreateSchema,
  heatListQuerySchema,
  pregnancyCheckSchema,
} from '@farm/contracts';
import type { CalvingInput, ColostrumInput, PregnancyCheck } from '@farm/contracts';
import type {
  BreedingCreate,
  BreedingListQuery,
  BreedingUpdate,
  HeatCreate,
  HeatListQuery,
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

  @Get('heat')
  @RequirePermissions('breeding:read')
  @ApiOperation({ summary: 'List heat / estrus logs' })
  listHeat(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(heatListQuerySchema)) query: HeatListQuery,
  ) {
    return this.breeding.listHeat(user, query);
  }

  @Post('heat')
  @RequirePermissions('breeding:write')
  @ApiOperation({ summary: 'Log heat / estrus' })
  logHeat(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(heatCreateSchema)) body: HeatCreate,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.breeding.logHeat(user, body, requestId);
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

  @Post(':id/calving')
  @RequirePermissions('breeding:write')
  calving(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(calvingSchema)) body: CalvingInput,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.breeding.recordCalving(user, id, body, requestId);
  }

  @Post(':id/pd')
  @RequirePermissions('breeding:write')
  pd(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(pregnancyCheckSchema)) body: PregnancyCheck,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.breeding.pregnancyCheck(user, id, body, requestId);
  }

  @Post(':id/colostrum')
  @RequirePermissions('breeding:write')
  colostrum(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(colostrumSchema)) body: ColostrumInput,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.breeding.recordColostrum(user, id, body, requestId);
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
