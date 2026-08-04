import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { FishController } from './fish.controller';
import { FishService } from './fish.service';

@Module({
  imports: [AuditModule],
  controllers: [FishController],
  providers: [FishService],
  exports: [FishService],
})
export class FishModule {}
