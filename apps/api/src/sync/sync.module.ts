import { Module } from '@nestjs/common';
import { AnimalsModule } from '../animals/animals.module';
import { AuditModule } from '../audit/audit.module';
import { BatchesModule } from '../batches/batches.module';
import { BreedingModule } from '../breeding/breeding.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { FarmsModule } from '../farms/farms.module';
import { FeedModule } from '../feed/feed.module';
import { HealthRecordsModule } from '../health-records/health-records.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PnlModule } from '../pnl/pnl.module';
import { ProductionModule } from '../production/production.module';
import { ReportsModule } from '../reports/reports.module';
import { RevenueModule } from '../revenue/revenue.module';
import { TasksModule } from '../tasks/tasks.module';
import { AnimalApplier } from './animal.applier';
import { SyncBootstrapService } from './sync-bootstrap.service';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
  imports: [
    AuditModule,
    AnimalsModule,
    BatchesModule,
    BreedingModule,
    DashboardModule,
    ExpensesModule,
    FarmsModule,
    FeedModule,
    HealthRecordsModule,
    InventoryModule,
    PnlModule,
    ProductionModule,
    ReportsModule,
    RevenueModule,
    TasksModule,
  ],
  controllers: [SyncController],
  providers: [SyncService, AnimalApplier, SyncBootstrapService],
})
export class SyncModule {}
