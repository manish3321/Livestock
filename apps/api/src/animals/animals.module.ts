import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { HerdNumberService } from '../herd-number/herd-number.service';
import { AnimalsController } from './animals.controller';
import { AnimalsService } from './animals.service';

@Module({
  imports: [AuditModule],
  controllers: [AnimalsController],
  providers: [AnimalsService, HerdNumberService],
  exports: [AnimalsService],
})
export class AnimalsModule {}
