import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  deliveryCreateSchema,
  milkEntryCreateSchema,
  milkEntryPatchSchema,
  milkRecordSchema,
  milkRoundStartSchema,
  milkSkipSchema,
  paymentStatementCreateSchema,
  tankUpdateSchema,
} from '@farm/contracts';
import type {
  DeliveryCreate,
  MilkEntryCreate,
  MilkEntryPatch,
  MilkRecord,
  MilkRoundStart,
  MilkSession,
  MilkSkip,
  PaymentStatementCreate,
  TankUpdate,
} from '@farm/contracts';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { RequestUser } from '../common/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { MilkService } from './milk.service';

@ApiTags('milk')
@Controller('milk')
export class MilkController {
  constructor(private readonly milk: MilkService) {}

  @Post()
  @RequirePermissions('production:write')
  @ApiOperation({ summary: 'Record one animal for a session. Duplicates are 409.' })
  createEntry(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(milkEntryCreateSchema)) body: MilkEntryCreate,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.milk.createEntry(user, body, requestId);
  }

  @Get('today')
  @RequirePermissions('production:read')
  today(@CurrentUser() user: RequestUser, @Query('session') session?: MilkSession) {
    return this.milk.today(user, session);
  }

  @Patch(':id')
  @RequirePermissions('production:write')
  @ApiOperation({ summary: 'Correct litres. Writes a revision; never silent overwrite.' })
  patchEntry(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(milkEntryPatchSchema)) body: MilkEntryPatch,
  ) {
    return this.milk.patchEntry(user, id, body);
  }

  @Get('daily-sheet')
  @RequirePermissions('production:read')
  @ApiOperation({ summary: 'Printed shed sheet: who to milk, withhold, treatments' })
  dailySheet(@CurrentUser() user: RequestUser) {
    return this.milk.dailySheet(user);
  }

  @Get('lookup')
  @RequirePermissions('production:read')
  @ApiOperation({ summary: 'Numeric search: 42 finds B42 and C42' })
  lookup(@CurrentUser() user: RequestUser, @Query('q') q: string) {
    return this.milk.lookup(user, q ?? '');
  }

  @Get('profit')
  @RequirePermissions('finance:read')
  @ApiOperation({ summary: 'Profit per animal at the price actually received' })
  profit(@CurrentUser() user: RequestUser) {
    return this.milk.profitRanking(user);
  }

  @Get('effective-price')
  @RequirePermissions('finance:read')
  effectivePrice(@CurrentUser() user: RequestUser) {
    return this.milk.effectivePrice(user);
  }

  @Post('rounds')
  @RequirePermissions('production:write')
  @ApiOperation({ summary: 'Start or resume a milking session' })
  start(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(milkRoundStartSchema)) body: MilkRoundStart,
  ) {
    return this.milk.currentOrStart(user, body);
  }

  @Get('rounds/:id')
  @RequirePermissions('production:read')
  get(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.milk.getRound(user, id);
  }

  @Post('rounds/:id/record')
  @RequirePermissions('production:write')
  @ApiOperation({ summary: 'Record or correct one animal in this session' })
  record(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(milkRecordSchema)) body: MilkRecord,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.milk.record(user, id, body, requestId);
  }

  @Post('rounds/:id/skip')
  @RequirePermissions('production:write')
  skip(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(milkSkipSchema)) body: MilkSkip,
  ) {
    return this.milk.skip(user, id, body);
  }

  @Post('rounds/:id/finish')
  @RequirePermissions('production:write')
  @ApiOperation({ summary: 'Close the round and snapshot expected tank litres' })
  finish(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.milk.finish(user, id);
  }

  @Patch('rounds/:id/tank')
  @RequirePermissions('production:write')
  tank(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(tankUpdateSchema)) body: TankUpdate,
  ) {
    return this.milk.updateTank(user, id, body);
  }

  @Post('rounds/:id/delivery')
  @RequirePermissions('revenue:write')
  delivery(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(deliveryCreateSchema)) body: DeliveryCreate,
  ) {
    return this.milk.addDelivery(user, id, body);
  }

  @Post('payments')
  @RequirePermissions('revenue:write')
  payment(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(paymentStatementCreateSchema)) body: PaymentStatementCreate,
  ) {
    return this.milk.recordPayment(user, body);
  }
}
