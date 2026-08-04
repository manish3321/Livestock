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
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  inventoryCreateSchema,
  inventoryUpdateSchema,
  pageQuerySchema,
  restockCreateSchema,
} from '@farm/contracts';
import type {
  InventoryCreate,
  InventoryUpdate,
  PageQuery,
  PageResult,
  RestockCreate,
} from '@farm/contracts';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { RequestUser } from '../common/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  InventoryService,
  type InventoryItemDto,
  type RestockRequestDto,
} from './inventory.service';

@ApiTags('inventory')
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  @RequirePermissions('inventory:read')
  @ApiOperation({ summary: 'List inventory items' })
  list(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(pageQuerySchema)) query: PageQuery,
  ): Promise<PageResult<InventoryItemDto>> {
    return this.inventory.list(user, query);
  }

  @Get(':id')
  @RequirePermissions('inventory:read')
  @ApiOperation({ summary: 'Get inventory item' })
  get(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<InventoryItemDto> {
    return this.inventory.get(user, id);
  }

  @Post()
  @RequirePermissions('inventory:write')
  @ApiOperation({ summary: 'Create inventory item' })
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(inventoryCreateSchema)) body: InventoryCreate,
    @Headers('x-request-id') requestId?: string,
  ): Promise<InventoryItemDto> {
    return this.inventory.create(user, body, requestId);
  }

  @Patch(':id')
  @RequirePermissions('inventory:write')
  @ApiOperation({ summary: 'Update inventory item' })
  update(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(inventoryUpdateSchema)) body: InventoryUpdate,
    @Headers('x-request-id') requestId?: string,
  ): Promise<InventoryItemDto> {
    return this.inventory.update(user, id, body, requestId);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('inventory:write')
  @ApiOperation({ summary: 'Soft-delete inventory item' })
  async remove(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<void> {
    await this.inventory.remove(user, id, requestId);
  }

  @Post(':id/restock')
  @RequirePermissions('inventory:restock-request')
  @ApiOperation({ summary: 'Request restock' })
  restock(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(restockCreateSchema)) body: RestockCreate,
    @Headers('x-request-id') requestId?: string,
  ): Promise<RestockRequestDto> {
    return this.inventory.requestRestock(user, id, body, requestId);
  }
}
