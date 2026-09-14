import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { MarkerCohortDto } from '@farm/contracts';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { RequestUser } from '../common/types';
import { AnimalsService } from './animals.service';

@ApiTags('markers')
@Controller('markers')
export class MarkersController {
  constructor(private readonly animals: AnimalsService) {}

  @Get('cohort')
  @RequirePermissions('animals:read')
  @ApiOperation({ summary: 'Active bands grouped by reason, pen then number' })
  cohort(@CurrentUser() user: RequestUser): Promise<MarkerCohortDto> {
    return this.animals.cohort(user);
  }
}
