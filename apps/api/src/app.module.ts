import { MiddlewareConsumer, Module, NestModule, type DynamicModule, type Provider } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, Reflector } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AnimalsModule } from './animals/animals.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { PermissionsGuard } from './auth/permissions.guard';
import { TokenService } from './auth/token.service';
import { BatchesModule } from './batches/batches.module';
import { BreedingModule } from './breeding/breeding.module';
import { AppExceptionFilter } from './common/http-exception.filter';
import { requestIdMiddleware } from './common/request-id.middleware';
import { DashboardModule } from './dashboard/dashboard.module';
import { ExpensesModule } from './expenses/expenses.module';
import { FarmsModule } from './farms/farms.module';
import { FishModule } from './fish/fish.module';
import { GroupsModule } from './groups/groups.module';
import { HealthModule } from './health/health.module';
import { HealthRecordsModule } from './health-records/health-records.module';
import { InventoryModule } from './inventory/inventory.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PnlModule } from './pnl/pnl.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductionModule } from './production/production.module';
import { SpeciesConfigModule } from './species-config/species-config.module';
import { FeedModule } from './feed/feed.module';
import { ReportsModule } from './reports/reports.module';
import { RevenueModule } from './revenue/revenue.module';
import { StorageModule } from './storage/storage.module';
import { SyncModule } from './sync/sync.module';
import { MilkModule } from './milk/milk.module';
import { RoundsModule } from './rounds/rounds.module';
import { TasksModule } from './tasks/tasks.module';
import { WithholdsModule } from './withholds/withholds.module';
import { VaccinationsModule } from './vaccinations/vaccinations.module';
import { ProfitModule } from './profit/profit.module';

/** Cron does not run on Vercel serverless; skip the ESM schedule package there. */
function cronSupport(): { imports: DynamicModule[]; providers: Provider[] } {
  if (process.env.VERCEL || process.env.VITEST) return { imports: [], providers: [] };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ScheduleModule } = require('@nestjs/schedule') as typeof import('@nestjs/schedule');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { NightlyJob } = require('./jobs/nightly.job') as typeof import('./jobs/nightly.job');
  return { imports: [ScheduleModule.forRoot()], providers: [NightlyJob] };
}

const cron = cronSupport();

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    ...cron.imports,
    PrismaModule,
    SpeciesConfigModule,
    NotificationsModule,
    StorageModule,
    AuthModule,
    AuditModule,
    FarmsModule,
    HealthModule,
    SyncModule,
    AnimalsModule,
    BatchesModule,
    GroupsModule,
    FishModule,
    ExpensesModule,
    RevenueModule,
    InventoryModule,
    HealthRecordsModule,
    BreedingModule,
    ProductionModule,
    FeedModule,
    DashboardModule,
    PnlModule,
    ReportsModule,
    MilkModule,
    RoundsModule,
    TasksModule,
    WithholdsModule,
    VaccinationsModule,
    ProfitModule,
  ],
  providers: [
    ...cron.providers,
    { provide: APP_FILTER, useClass: AppExceptionFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    {
      provide: APP_GUARD,
      useFactory: (reflector: Reflector, tokens: TokenService) =>
        new JwtAuthGuard(reflector, tokens),
      inject: [Reflector, TokenService],
    },
    {
      provide: APP_GUARD,
      useFactory: (reflector: Reflector) => new PermissionsGuard(reflector),
      inject: [Reflector],
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(requestIdMiddleware).forRoutes('*');
  }
}
