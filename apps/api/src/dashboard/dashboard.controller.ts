import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators';
import type { RequestUser } from '../common/types';
import { DashboardService, type DashboardSummary } from './dashboard.service';

@ApiTags('dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Farm dashboard summary' })
  summary(@CurrentUser() user: RequestUser): Promise<DashboardSummary> {
    return this.dashboard.summary(user);
  }
}
