import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  recordingRoundCreateSchema,
  recordingRoundFinishSchema,
  roundTodayQuerySchema,
  scanCreateSchema,
} from '@farm/contracts';
import type {
  RecordingRoundCreate,
  RecordingRoundFinish,
  RoundTodayQuery,
  ScanCreate,
} from '@farm/contracts';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { RequestUser } from '../common/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { RoundsService } from './rounds.service';

@ApiTags('rounds')
@Controller('rounds')
export class RoundsController {
  constructor(private readonly rounds: RoundsService) {}

  @Post()
  @RequirePermissions('rounds:write')
  @ApiOperation({ summary: 'Start or resume a shed recording round' })
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(recordingRoundCreateSchema)) body: RecordingRoundCreate,
  ) {
    return this.rounds.create(user, body);
  }

  @Get('active')
  @RequirePermissions('rounds:read')
  @ApiOperation({ summary: 'Open shed round (optional mode/session so milking and vaccination can both stay open)' })
  active(
    @CurrentUser() user: RequestUser,
    @Query('mode') mode?: string,
    @Query('session') session?: string,
  ) {
    return this.rounds.active(
      user,
      mode as import('@farm/contracts').RecordingMode | undefined,
      session as import('@farm/contracts').MilkSession | undefined,
    );
  }

  @Get('today')
  @RequirePermissions('rounds:read')
  @ApiOperation({ summary: "Today's shed progress for a mode/session: who is still not done" })
  today(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(roundTodayQuerySchema)) query: RoundTodayQuery,
  ) {
    return this.rounds.today(user, query);
  }

  @Get('metrics')
  @RequirePermissions('reports:read')
  @ApiOperation({ summary: 'Round speed, completeness and abandon rate' })
  metrics(
    @CurrentUser() user: RequestUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.rounds.metrics(user, from ? new Date(from) : undefined, to ? new Date(to) : undefined);
  }

  @Get(':id/remaining')
  @RequirePermissions('rounds:read')
  remaining(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.rounds.remaining(user, id);
  }

  @Post(':id/finish')
  @RequirePermissions('rounds:write')
  finish(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(recordingRoundFinishSchema)) body: RecordingRoundFinish,
  ) {
    return this.rounds.finish(user, id, body);
  }

  @Post(':id/abandon')
  @RequirePermissions('rounds:write')
  abandon(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.rounds.abandon(user, id);
  }
}

@ApiTags('scans')
@Controller('scans')
export class ScansController {
  constructor(private readonly rounds: RoundsService) {}

  @Post()
  @RequirePermissions('animals:read')
  @ApiOperation({ summary: 'Resolve a scan to the next shed action in one response' })
  scan(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(scanCreateSchema)) body: ScanCreate,
  ) {
    return this.rounds.scan(user, body);
  }
}
