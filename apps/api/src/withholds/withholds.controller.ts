import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { RequestUser } from '../common/types';
import { WithholdsService } from './withholds.service';

@ApiTags('withholds')
@Controller('withholds')
export class WithholdsController {
  constructor(private readonly withholds: WithholdsService) {}

  @Get('active')
  @RequirePermissions('health:read')
  @ApiOperation({ summary: 'Animals whose milk must not be sold today' })
  active(@CurrentUser() user: RequestUser) {
    return this.withholds.activeForFarm(user);
  }
}
