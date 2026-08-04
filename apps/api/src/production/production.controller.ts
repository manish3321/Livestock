import { Body, Controller, Get, Headers, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { productionCreateSchema, productionListQuerySchema } from '@farm/contracts';
import type {
  PageResult,
  ProductionCreate,
  ProductionListQuery,
} from '@farm/contracts';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { RequestUser } from '../common/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ProductionService, type ProductionEntryDto } from './production.service';

@ApiTags('production')
@Controller('production')
export class ProductionController {
  constructor(private readonly production: ProductionService) {}

  @Get()
  @RequirePermissions('production:read')
  @ApiOperation({ summary: 'List production entries' })
  list(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(productionListQuerySchema))
    query: ProductionListQuery,
  ): Promise<PageResult<ProductionEntryDto>> {
    return this.production.list(user, query);
  }

  @Post()
  @RequirePermissions('production:write')
  @ApiOperation({ summary: 'Create production entry' })
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(productionCreateSchema)) body: ProductionCreate,
    @Headers('x-request-id') requestId?: string,
  ): Promise<ProductionEntryDto> {
    return this.production.create(user, body, requestId);
  }
}
