import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { mortalityRecordCreateSchema } from '@farm/contracts';
import type { MortalityRecordCreate, MortalityRecordDto } from '@farm/contracts';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { RequestUser } from '../common/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { HealthRecordsService } from './health-records.service';

@ApiTags('mortality')
@Controller('mortality')
export class MortalityController {
  constructor(private readonly health: HealthRecordsService) {}

  @Post()
  @RequirePermissions('animals:write')
  @ApiOperation({ summary: 'Record a death and the calculated lactation loss' })
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(mortalityRecordCreateSchema)) body: MortalityRecordCreate,
    @Headers('x-request-id') _requestId?: string,
  ): Promise<MortalityRecordDto> {
    return this.health.recordMortality(user, body);
  }
}
