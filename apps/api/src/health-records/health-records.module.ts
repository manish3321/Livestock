import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { WithholdsModule } from '../withholds/withholds.module';
import { HealthRecordsController } from './health-records.controller';
import { HealthRecordsService } from './health-records.service';

@Module({
  imports: [AuditModule, WithholdsModule],
  controllers: [HealthRecordsController],
  providers: [HealthRecordsService],
  exports: [HealthRecordsService],
})
export class HealthRecordsModule {}
