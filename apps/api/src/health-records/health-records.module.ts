import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { BreedingModule } from '../breeding/breeding.module';
import { ProfitModule } from '../profit/profit.module';
import { WithholdsModule } from '../withholds/withholds.module';
import { HealthRecordsController } from './health-records.controller';
import { HealthRecordsService } from './health-records.service';
import { MortalityController } from './mortality.controller';
import { UdderController } from './udder.controller';

@Module({
  imports: [AuditModule, WithholdsModule, ProfitModule, BreedingModule],
  controllers: [HealthRecordsController, UdderController, MortalityController],
  providers: [HealthRecordsService],
  exports: [HealthRecordsService],
})
export class HealthRecordsModule {}
