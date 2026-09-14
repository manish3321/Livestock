import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { udderCheckCreateSchema } from '@farm/contracts';
import type { UdderCheckCreate, UdderCheckDto } from '@farm/contracts';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { RequestUser } from '../common/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { HealthRecordsService } from './health-records.service';

@ApiTags('udder')
@Controller('udder-checks')
export class UdderController {
  constructor(private readonly health: HealthRecordsService) {}

  @Post()
  @RequirePermissions('health:write')
  @ApiOperation({ summary: 'Record a CMT / strip-cup / visual udder check' })
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(udderCheckCreateSchema)) body: UdderCheckCreate,
    @Headers('x-request-id') _requestId?: string,
  ): Promise<UdderCheckDto> {
    return this.health.createUdderCheck(user, body);
  }
}
