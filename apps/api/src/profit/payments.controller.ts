import { Body, Controller, Get, Headers, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { paymentStatementCreateSchema, type PaymentStatementCreate } from '@farm/contracts';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { RequestUser } from '../common/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ProfitService } from './profit.service';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly profit: ProfitService) {}

  @Post()
  @RequirePermissions('revenue:write')
  @ApiOperation({ summary: 'Record a cooperative payment and recompute effective price' })
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(paymentStatementCreateSchema)) body: PaymentStatementCreate,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.profit.recordPayment(user, body, requestId);
  }

  @Get('effective-price')
  @RequirePermissions('finance:read')
  @ApiOperation({ summary: 'Farm effective milk price (never the headline rate)' })
  effectivePrice(@CurrentUser() user: RequestUser) {
    return this.profit.effectivePrice(user.farmId);
  }
}
