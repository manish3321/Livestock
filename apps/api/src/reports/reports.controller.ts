import { Controller, Get, Param, ParseUUIDPipe, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  cooperativeReportQuerySchema,
  dailyReportQuerySchema,
  herdMonthlyReportQuerySchema,
  insuranceClaimQuerySchema,
  monthlyReportQuerySchema,
  periodReportQuerySchema,
  reportQuerySchema,
  vaccinationProofQuerySchema,
} from '@farm/contracts';
import type {
  CooperativeReportQuery,
  DailyReportQuery,
  HerdMonthlyReportQuery,
  InsuranceClaimQuery,
  MonthlyReportQuery,
  PeriodReportQuery,
  ReportQuery,
  VaccinationProofQuery,
} from '@farm/contracts';
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

  @Get('daily')
  @RequirePermissions('reports:read')
  @ApiOperation({ summary: 'What happened today: milk, treatments, breeding, tasks' })
  daily(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(dailyReportQuerySchema)) query: DailyReportQuery,
  ) {
    return this.reports.daily(user, query);
  }

  @Get('monthly')
  @RequirePermissions('reports:read')
  @ApiOperation({ summary: 'Monthly milk, money, health, breeding, feed, herd vs budget and last year' })
  monthly(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(monthlyReportQuerySchema)) query: MonthlyReportQuery,
  ) {
    return this.reports.monthly(user, query);
  }

  @Get('cooperative')
  @RequirePermissions('reports:read')
  @ApiOperation({ summary: 'Cooperative volume and quality by day' })
  cooperative(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(cooperativeReportQuerySchema)) query: CooperativeReportQuery,
  ) {
    return this.reports.cooperative(user, query);
  }

  @Get('vaccination-proof')
  @RequirePermissions('reports:read')
  @ApiOperation({ summary: 'Vaccination proof for the livestock office' })
  vaccinationProof(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(vaccinationProofQuerySchema)) query: VaccinationProofQuery,
  ) {
    return this.reports.vaccinationProof(user, query);
  }

  @Get('insurance-claim')
  @RequirePermissions('reports:read')
  @ApiOperation({ summary: 'Animal details and cause of death for an insurance claim' })
  insuranceClaim(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(insuranceClaimQuerySchema)) query: InsuranceClaimQuery,
  ) {
    return this.reports.insuranceClaim(user, query);
  }

  @Get('vet-history/:animalId')
  @RequirePermissions('reports:read')
  @ApiOperation({ summary: 'Full veterinary history for one animal' })
  vetHistory(
    @CurrentUser() user: RequestUser,
    @Param('animalId', ParseUUIDPipe) animalId: string,
  ) {
    return this.reports.vetHistory(user, animalId);
  }
}
