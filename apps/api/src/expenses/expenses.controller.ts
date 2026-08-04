import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  expenseCreateSchema,
  expenseListQuerySchema,
  expenseReviewSchema,
} from '@farm/contracts';
import type {
  ExpenseCreate,
  ExpenseListQuery,
  ExpenseReview,
  PageResult,
} from '@farm/contracts';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { RequestUser } from '../common/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ExpensesService, type ExpenseDto } from './expenses.service';

@ApiTags('expenses')
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Get()
  @RequirePermissions('expenses:read')
  @ApiOperation({ summary: 'List expenses' })
  list(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(expenseListQuerySchema)) query: ExpenseListQuery,
  ): Promise<PageResult<ExpenseDto>> {
    return this.expenses.list(user, query);
  }

  @Post()
  @RequirePermissions('expenses:submit')
  @ApiOperation({ summary: 'Submit an expense' })
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(expenseCreateSchema)) body: ExpenseCreate,
    @Headers('x-request-id') requestId?: string,
  ): Promise<ExpenseDto> {
    return this.expenses.create(user, body, requestId);
  }

  @Post(':id/review')
  @RequirePermissions('expenses:approve')
  @ApiOperation({ summary: 'Approve or reject an expense' })
  review(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(expenseReviewSchema)) body: ExpenseReview,
    @Headers('x-request-id') requestId?: string,
  ): Promise<ExpenseDto> {
    return this.expenses.review(user, id, body, requestId);
  }
}
