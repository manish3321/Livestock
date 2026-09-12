import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { MilkController } from './milk.controller';
import { MilkService } from './milk.service';

@Module({
  imports: [AuditModule],
  controllers: [MilkController],
  providers: [MilkService],
  exports: [MilkService],
})
export class MilkModule {}
