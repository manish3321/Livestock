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
  breedingBoardQuerySchema,
  breedingCreateSchema,
  breedingListQuerySchema,
  breedingUpdateSchema,
  calvingSchema,
  colostrumSchema,
  decisionResolveSchema,
  dryOffCompleteSchema,
  heatCreateSchema,
  heatListQuerySchema,
  heatObservationSchema,
  heatUpdateSchema,
  pregnancyCheckSchema,
  protocolListQuerySchema,
  protocolSuggestQuerySchema,
  stageDurationsQuerySchema,
  syncEnrollSchema,
  breedingWatchQuerySchema,
} from '@farm/contracts';
import type {
  BreedingBoardQuery,
  CalvingInput,
  ColostrumInput,
  DecisionResolveInput,
  DryOffCompleteInput,
  HeatObservationInput,
  HeatUpdate,
  PregnancyCheck,
  ProtocolListQuery,
  ProtocolSuggestQuery,
  StageDurationsQuery,
  SyncEnrollInput,
  BreedingWatchQuery,
} from '@farm/contracts';
import type {
  BreedingCreate,
  BreedingListQuery,
  BreedingMetricsDto,
  BreedingUpdate,
  HeatCreate,
  HeatListQuery,
  PageResult,
  PedigreeNodeDto,
} from '@farm/contracts';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { RequestUser } from '../common/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { BreedingService, type BreedingRecordDto } from './breeding.service';
import { BreedingBoardService } from './breeding-board.service';
import { ReproStageService } from './repro-stage.service';
import { BreedingWatchService } from './breeding-watch.service';

@ApiTags('breeding')
@Controller('breeding')
export class BreedingController {
  constructor(
    private readonly breeding: BreedingService,
    private readonly board: BreedingBoardService,
    private readonly stages: ReproStageService,
    private readonly watch: BreedingWatchService,
  ) {}

  @Get()
  @RequirePermissions('breeding:read')
  @ApiOperation({ summary: 'List breeding records' })
  list(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(breedingListQuerySchema)) query: BreedingListQuery,
  ): Promise<PageResult<BreedingRecordDto>> {
    return this.breeding.list(user, query);
  }

  @Get('board')
  @RequirePermissions('breeding:read')
  @ApiOperation({ summary: 'Today’s breeding board — one payload for a shed walk' })
  boardToday(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(breedingBoardQuerySchema)) query: BreedingBoardQuery,
  ) {
    return this.board.getBoard(user, query.date);
  }

  @Get('watch')
  @RequirePermissions('breeding:read')
  @ApiOperation({ summary: 'Stage watch screen — one payload with countdowns' })
  watchScreen(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(breedingWatchQuerySchema)) query: BreedingWatchQuery,
  ) {
    return this.watch.getWatch(user, query.stage);
  }

  @Get('decisions')
  @RequirePermissions('tasks:manage')
  @ApiOperation({ summary: 'Manager decision queue' })
  decisions(@CurrentUser() user: RequestUser) {
    return this.board.getDecisions(user);
  }

  @Get('protocols')
  @RequirePermissions('breeding:read')
  listProtocols(
    @Query(new ZodValidationPipe(protocolListQuerySchema)) query: ProtocolListQuery,
  ) {
    return this.board.listProtocols(query.species);
  }

  @Get('protocols/suggest')
  @RequirePermissions('breeding:read')
  suggestProtocol(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(protocolSuggestQuerySchema)) query: ProtocolSuggestQuery,
  ) {
    return this.board.suggestProtocol(user, query.animalId);
  }

  @Get('sync-enrollments/active')
  @RequirePermissions('breeding:read')
  activeEnrollments(@CurrentUser() user: RequestUser) {
    return this.board.listActiveEnrollments(user);
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

  @Get('metrics')
  @RequirePermissions('breeding:read')
  @ApiOperation({ summary: 'Herd breeding metrics, open-day cost, observer heat detection' })
  metrics(@CurrentUser() user: RequestUser): Promise<BreedingMetricsDto> {
    return this.breeding.herdMetrics(user);
  }

  @Get('stage-durations')
  @RequirePermissions('reports:read')
  @ApiOperation({ summary: 'Mean days spent in each reproductive stage' })
  stageDurations(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(stageDurationsQuerySchema)) query: StageDurationsQuery,
  ) {
    return this.stages.stageDurations(user.farmId, query.from, query.to);
  }

  @Get('pedigree/:animalId')
  @RequirePermissions('breeding:read')
  @ApiOperation({ summary: 'Three-generation pedigree walk' })
  pedigree(
    @CurrentUser() user: RequestUser,
    @Param('animalId', ParseUUIDPipe) animalId: string,
  ): Promise<PedigreeNodeDto> {
    return this.breeding.pedigree(user, animalId);
  }

  @Post('heat-observation')
  @RequirePermissions('breeding:write')
  @ApiOperation({ summary: 'Record a heat check, including saw-nothing' })
  heatObservation(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(heatObservationSchema)) body: HeatObservationInput,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.board.recordHeatObservation(user, body, requestId);
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

  @Patch('heat/:id')
  @RequirePermissions('breeding:write')
  @ApiOperation({ summary: 'Update a heat / estrus log' })
  updateHeat(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(heatUpdateSchema)) body: HeatUpdate,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.breeding.updateHeat(user, id, body, requestId);
  }

  @Delete('heat/:id')
  @HttpCode(204)
  @RequirePermissions('breeding:write')
  @ApiOperation({ summary: 'Delete a heat / estrus log' })
  async removeHeat(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<void> {
    await this.breeding.removeHeat(user, id, requestId);
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

  @Post('sync-enrollments')
  @RequirePermissions('breeding:write')
  enrollSync(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(syncEnrollSchema)) body: SyncEnrollInput,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.board.enroll(user, body, requestId);
  }

  @Post('sync-enrollments/:id/cancel')
  @RequirePermissions('breeding:write')
  cancelSync(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.board.cancelEnrollment(user, id, requestId);
  }

  @Post('sync-tasks/:taskId/complete')
  @RequirePermissions('breeding:write')
  completeSyncTask(
    @CurrentUser() user: RequestUser,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.board.completeSyncTask(user, taskId, requestId);
  }

  @Post('decisions/:taskId/resolve')
  @RequirePermissions('tasks:manage')
  resolveDecision(
    @CurrentUser() user: RequestUser,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body(new ZodValidationPipe(decisionResolveSchema)) body: DecisionResolveInput,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.board.resolveDecision(user, taskId, body, requestId);
  }

  @Post('dry-off')
  @RequirePermissions('breeding:write')
  dryOff(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(dryOffCompleteSchema)) body: DryOffCompleteInput,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.board.completeDryOff(user, body, requestId);
  }

  @Post('calving')
  @RequirePermissions('breeding:write')
  @ApiOperation({ summary: 'Record a calving (service optional)' })
  farmCalving(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(calvingSchema)) body: CalvingInput,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.breeding.recordFarmCalving(user, body, requestId);
  }

  @Post('colostrum')
  @RequirePermissions('breeding:write')
  @ApiOperation({ summary: 'Record a colostrum feeding' })
  farmColostrum(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(colostrumSchema)) body: ColostrumInput,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.breeding.recordFarmColostrum(user, body, requestId);
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

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('breeding:write')
  @ApiOperation({ summary: 'Delete a breeding / service record' })
  async remove(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<void> {
    await this.breeding.remove(user, id, requestId);
  }
}
