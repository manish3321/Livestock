import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  expenseBudgetQuerySchema,
  expenseBudgetUpsertSchema,
  expenseCreateSchema,
  expenseListQuerySchema,
  expenseReviewSchema,
  recurringExpenseCreateSchema,
} from '@farm/contracts';
import type {
  ExpenseBudgetQuery,
  ExpenseBudgetUpsert,
  ExpenseCreate,
  ExpenseListQuery,
  ExpenseReview,
  PageResult,
  RecurringExpenseCreate,
} from '@farm/contracts';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { RequestUser } from '../common/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { STORAGE_PORT, type StoragePort } from '../storage/storage.port';
import {
  ExpensesService,
  type ExpenseBudgetDto,
  type ExpenseDto,
  type RecurringExpenseDto,
} from './expenses.service';

@ApiTags('expenses')
@Controller('expenses')
export class ExpensesController {
  constructor(
    private readonly expenses: ExpensesService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
  ) {}

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

  @Get('budgets')
  @RequirePermissions('expenses:read')
  @ApiOperation({ summary: 'List expense budgets for a month' })
  listBudgets(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(expenseBudgetQuerySchema)) query: ExpenseBudgetQuery,
  ): Promise<ExpenseBudgetDto[]> {
    return this.expenses.listBudgets(user, query);
  }

  @Put('budgets')
  @RequirePermissions('expenses:approve')
  @ApiOperation({ summary: 'Upsert an expense budget' })
  upsertBudget(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(expenseBudgetUpsertSchema)) body: ExpenseBudgetUpsert,
    @Headers('x-request-id') requestId?: string,
  ): Promise<ExpenseBudgetDto> {
    return this.expenses.upsertBudget(user, body, requestId);
  }

  @Get('recurring')
  @RequirePermissions('expenses:read')
  @ApiOperation({ summary: 'List recurring expense templates' })
  listRecurring(@CurrentUser() user: RequestUser): Promise<RecurringExpenseDto[]> {
    return this.expenses.listRecurring(user);
  }

  @Post('recurring')
  @RequirePermissions('expenses:submit')
  @ApiOperation({ summary: 'Create a recurring expense template' })
  createRecurring(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(recurringExpenseCreateSchema))
    body: RecurringExpenseCreate,
    @Headers('x-request-id') requestId?: string,
  ): Promise<RecurringExpenseDto> {
    return this.expenses.createRecurring(user, body, requestId);
  }

  @Post('recurring/generate-month')
  @RequirePermissions('expenses:submit')
  @ApiOperation({ summary: 'Generate expenses from active recurring templates for this month' })
  generateMonth(
    @CurrentUser() user: RequestUser,
    @Headers('x-request-id') requestId?: string,
  ): Promise<{ created: number; expenses: ExpenseDto[] }> {
    return this.expenses.generateMonth(user, requestId);
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

  @Post(':id/receipt')
  @RequirePermissions('expenses:submit')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload expense receipt file' })
  uploadReceipt(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile()
    file: { buffer: Buffer; originalname: string; mimetype: string } | undefined,
    @Headers('x-request-id') requestId?: string,
  ): Promise<ExpenseDto> {
    if (!file?.buffer) {
      throw new BadRequestException({
        code: 'FILE_REQUIRED',
        message: 'Multipart file field "file" is required',
      });
    }
    return this.expenses.uploadReceipt(user, id, file, this.storage, requestId);
  }

  @Get(':id/receipt')
  @RequirePermissions('expenses:read')
  @ApiOperation({ summary: 'Download expense receipt file' })
  async getReceipt(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.streamReceipt(user, id, res);
  }

  @Get(':id/receipt/file')
  @RequirePermissions('expenses:read')
  @ApiOperation({ summary: 'Download expense receipt file (URL alias)' })
  async getReceiptFile(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.streamReceipt(user, id, res);
  }

  private async streamReceipt(
    user: RequestUser,
    id: string,
    res: Response,
  ): Promise<void> {
    const { buffer, contentType, filename } = await this.expenses.getReceiptBuffer(
      user,
      id,
      this.storage,
    );
    res.setHeader('content-type', contentType);
    res.setHeader('content-disposition', `inline; filename="${filename}"`);
    res.send(buffer);
  }
}
