import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PaymentsController } from './payments.controller';
import { ProfitService } from './profit.service';

@Module({
  imports: [AuditModule],
  controllers: [PaymentsController],
  providers: [ProfitService],
  exports: [ProfitService],
})
export class ProfitModule {}
