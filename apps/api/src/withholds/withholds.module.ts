import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { WithholdsController } from './withholds.controller';
import { WithholdsService } from './withholds.service';

@Module({
  imports: [AuditModule],
  controllers: [WithholdsController],
  providers: [WithholdsService],
  exports: [WithholdsService],
})
export class WithholdsModule {}
