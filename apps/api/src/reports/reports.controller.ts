import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { herdMonthlyReportQuerySchema, periodReportQuerySchema, reportQuerySchema } from '@farm/contracts';
import type { HerdMonthlyReportQuery, PeriodReportQuery, ReportQuery } from '@farm/contracts';
import type { Response } from 'express';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { RequestUser } from '../common/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('farm-overview')
  @RequirePermissions('reports:read')
  @ApiOperation({ summary: 'Farm overview JSON report' })
  farmOverview(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(reportQuerySchema)) query: ReportQuery,
  ) {
    return this.reports.farmOverview(user, query);
  }

  @Get('animal-inventory')
  @RequirePermissions('reports:read')
  @ApiOperation({ summary: 'Animal inventory JSON report' })
  animalInventory(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(reportQuerySchema)) query: ReportQuery,
  ) {
    return this.reports.animalInventory(user, query);
  }

  @Get('animal-inventory.csv')
  @RequirePermissions('export:data')
  @ApiOperation({ summary: 'Animal inventory CSV export' })
  async animalInventoryCsv(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(reportQuerySchema)) query: ReportQuery,
    @Res() res: Response,
  ): Promise<void> {
    const csv = await this.reports.animalInventoryCsv(user, query);
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader(
      'content-disposition',
      `attachment; filename="animal-inventory-${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    res.send(csv);
  }

  @Get('health-summary')
  @RequirePermissions('reports:read')
  @ApiOperation({ summary: 'Health summary JSON report' })
  healthSummary(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(reportQuerySchema)) query: ReportQuery,
  ) {
    return this.reports.healthSummary(user, query);
  }

  @Get('herd-monthly')
  @RequirePermissions('reports:read')
  @ApiOperation({ summary: 'Monthly herd batch summary (livestock/poultry/fish)' })
  herdMonthly(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(herdMonthlyReportQuerySchema))
    query: HerdMonthlyReportQuery,
  ) {
    return this.reports.herdMonthly(user, query.year, query.month, query.kind);
  }

  @Get('herd-monthly.csv')
  @RequirePermissions('export:data')
  @ApiOperation({ summary: 'Monthly herd batch CSV export' })
  async herdMonthlyCsv(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(herdMonthlyReportQuerySchema))
    query: HerdMonthlyReportQuery,
    @Res() res: Response,
  ): Promise<void> {
    const csv = await this.reports.herdMonthlyCsv(
      user,
      query.year,
      query.month,
      query.kind,
    );
    const kind = query.kind ?? 'all';
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader(
      'content-disposition',
      `attachment; filename="herd-monthly-${query.year}-${String(query.month).padStart(2, '0')}-${kind}.csv"`,
    );
    res.send(csv);
  }

  @Get('period')
  @RequirePermissions('reports:read')
  @ApiOperation({ summary: 'Daily / weekly / quarterly / annual report pack' })
  period(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(periodReportQuerySchema)) query: PeriodReportQuery,
  ) {
    return this.reports.periodPack(user, query.kind, query.date);
  }

  @Get('period.csv')
  @RequirePermissions('export:data')
  @ApiOperation({ summary: 'Period report pack CSV' })
  async periodCsv(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(periodReportQuerySchema)) query: PeriodReportQuery,
    @Res() res: Response,
  ): Promise<void> {
    const csv = await this.reports.periodPackCsv(user, query.kind, query.date);
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader(
      'content-disposition',
      `attachment; filename="period-${query.kind}-${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    res.send(csv);
  }
}
