import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  groupCreateSchema,
  groupUpdateSchema,
  mortalityCreateSchema,
  pageQuerySchema,
} from '@farm/contracts';
import type {
  GroupCreate,
  GroupUpdate,
  MortalityCreate,
  PageQuery,
  PageResult,
} from '@farm/contracts';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { DeprecatedEndpointInterceptor } from '../common/deprecated-endpoint.interceptor';
import type { RequestUser } from '../common/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { GroupsService, type GroupDto, type MortalityDto } from './groups.service';

/** @deprecated Superseded by /v1/batches?kind=POULTRY. Removed after one release. */
@ApiTags('groups')
@Controller('groups')
@UseInterceptors(new DeprecatedEndpointInterceptor('/v1/batches?kind=POULTRY'))
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}

  @Get()
  @RequirePermissions('groups:read')
  @ApiOperation({ summary: 'List animal groups' })
  list(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(pageQuerySchema)) query: PageQuery,
  ): Promise<PageResult<GroupDto>> {
    return this.groups.list(user, query);
  }

  @Get(':id')
  @RequirePermissions('groups:read')
  @ApiOperation({ summary: 'Get animal group' })
  get(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<GroupDto> {
    return this.groups.get(user, id);
  }

  @Post()
  @RequirePermissions('groups:write')
  @ApiOperation({ summary: 'Create animal group' })
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(groupCreateSchema)) body: GroupCreate,
    @Headers('x-request-id') requestId?: string,
  ): Promise<GroupDto> {
    return this.groups.create(user, body, requestId);
  }

  @Patch(':id')
  @RequirePermissions('groups:write')
  @ApiOperation({ summary: 'Update animal group' })
  update(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(groupUpdateSchema)) body: GroupUpdate,
    @Headers('x-request-id') requestId?: string,
  ): Promise<GroupDto> {
    return this.groups.update(user, id, body, requestId);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('groups:write')
  @ApiOperation({ summary: 'Soft-delete animal group' })
  async remove(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<void> {
    await this.groups.remove(user, id, requestId);
  }

  @Post(':id/mortality')
  @RequirePermissions('groups:write')
  @ApiOperation({ summary: 'Record mortality (subtracts from currentCount)' })
  addMortality(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(mortalityCreateSchema)) body: MortalityCreate,
    @Headers('x-request-id') requestId?: string,
  ): Promise<MortalityDto> {
    return this.groups.addMortality(user, id, body, requestId);
  }
}
