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
  stockLotCreateSchema,
  stockMovementCreateSchema,
} from '@farm/contracts';
import type {
  InventoryCreate,
  InventoryUpdate,
  PageQuery,
  PageResult,
  RestockCreate,
  StockMovementCreate,
} from '@farm/contracts';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { RequestUser } from '../common/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  InventoryService,
  type InventoryItemDto,
  type RestockRequestDto,
  type StockMovementDto,
} from './inventory.service';

@ApiTags('inventory')
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Post('lots')
  @RequirePermissions('inventory:write')
  @ApiOperation({ summary: 'Receive a stock lot' })
  createLot(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(stockLotCreateSchema)) body: import('@farm/contracts').StockLotCreate,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.inventory.createLot(user, body, requestId);
  }

  @Get('lots/expiring')
  @RequirePermissions('inventory:read')
  @ApiOperation({ summary: 'Lots expiring within 30 days' })
  expiring(@CurrentUser() user: RequestUser) {
    return this.inventory.expiringLots(user);
  }

  @Get()
  @RequirePermissions('inventory:read')
  @ApiOperation({ summary: 'List inventory items' })
  list(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(pageQuerySchema)) query: PageQuery,
  ): Promise<PageResult<InventoryItemDto>> {
    return this.inventory.list(user, query);
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

  @Post('restock/:requestId/receive')
  @RequirePermissions('inventory:write')
  @ApiOperation({ summary: 'Mark restock as RECEIVED and write IN movement' })
  receiveRestock(
    @CurrentUser() user: RequestUser,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Headers('x-request-id') auditRequestId?: string,
  ): Promise<RestockRequestDto> {
    return this.inventory.receiveRestock(user, requestId, auditRequestId);
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

  @Get(':id/movements')
  @RequirePermissions('inventory:read')
  @ApiOperation({ summary: 'List stock movements for an item' })
  listMovements(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StockMovementDto[]> {
    return this.inventory.listMovements(user, id);
  }

  @Post(':id/movements')
  @RequirePermissions('inventory:write')
  @ApiOperation({ summary: 'Create a stock movement and adjust stock' })
  createMovement(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(stockMovementCreateSchema)) body: StockMovementCreate,
    @Headers('x-request-id') requestId?: string,
  ): Promise<StockMovementDto> {
    return this.inventory.createMovement(user, id, body, requestId);
  }
}
