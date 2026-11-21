import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  platformClientCreateSchema,
  platformClientUpdateSchema,
} from '@farm/contracts';
import type { PlatformClientCreate, PlatformClientUpdate } from '@farm/contracts';
import { CurrentUser, PlatformOnly } from '../common/decorators';
import type { RequestUser } from '../common/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PlatformService } from './platform.service';

@ApiTags('platform')
@PlatformOnly()
@Controller('platform')
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}

  @Get('clients')
  @ApiOperation({ summary: 'List every client farm' })
  listClients() {
    return this.platform.listClients();
  }

  @Post('clients')
  @ApiOperation({ summary: 'Create a client farm and its first ADMIN' })
  createClient(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(platformClientCreateSchema)) body: PlatformClientCreate,
  ) {
    return this.platform.createClient(user, body);
  }

  @Get('clients/:farmId')
  @ApiOperation({ summary: 'One client farm and its members' })
  getClient(@Param('farmId', ParseUUIDPipe) farmId: string) {
    return this.platform.getClient(farmId);
  }

  @Patch('clients/:farmId')
  @ApiOperation({ summary: 'Update client name/location or suspend/reactivate' })
  updateClient(
    @CurrentUser() user: RequestUser,
    @Param('farmId', ParseUUIDPipe) farmId: string,
    @Body(new ZodValidationPipe(platformClientUpdateSchema)) body: PlatformClientUpdate,
  ) {
    return this.platform.updateClient(user, farmId, body);
  }
}
