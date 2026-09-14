import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { batchVaccinateSchema, type BatchVaccinate } from '@farm/contracts';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { RequestUser } from '../common/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { VaccinationsService } from './vaccinations.service';

@ApiTags('health')
@Controller('health')
export class VaccinationsController {
  constructor(private readonly vaccinations: VaccinationsService) {}

  @Post('vaccinations/batch')
  @RequirePermissions('health:write')
  @ApiOperation({ summary: 'Batch-vaccinate animals (one HealthEvent + record + stock movement each)' })
  batch(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(batchVaccinateSchema)) body: BatchVaccinate,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.vaccinations.batch(user, body, requestId);
  }
}
