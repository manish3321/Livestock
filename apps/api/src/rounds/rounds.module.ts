import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { MilkModule } from '../milk/milk.module';
import { RoundsController, ScansController } from './rounds.controller';
import { RoundsService } from './rounds.service';

@Module({
  imports: [AuditModule, MilkModule],
  controllers: [RoundsController, ScansController],
  providers: [RoundsService],
  exports: [RoundsService],
})
export class RoundsModule {}
