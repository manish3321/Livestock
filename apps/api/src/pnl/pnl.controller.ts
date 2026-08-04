import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { pnlQuerySchema } from '@farm/contracts';
import type { PnlQuery } from '@farm/contracts';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { RequestUser } from '../common/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PnlService, type PnlReport } from './pnl.service';

@ApiTags('pnl')
@Controller('pnl')
export class PnlController {
  constructor(private readonly pnl: PnlService) {}

  @Get()
  @RequirePermissions('finance:read')
  @ApiOperation({ summary: 'Profit & loss by period' })
  get(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(pnlQuerySchema)) query: PnlQuery,
  ): Promise<PnlReport> {
    return this.pnl.get(user, query);
  }
}
