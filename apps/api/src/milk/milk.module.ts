import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ProfitModule } from '../profit/profit.module';
import { MilkController } from './milk.controller';
import { MilkService } from './milk.service';

@Module({
  imports: [AuditModule, ProfitModule],
  controllers: [MilkController],
  providers: [MilkService],
  exports: [MilkService],
})
export class MilkModule {}
