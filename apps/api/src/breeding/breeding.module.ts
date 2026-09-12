import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { HerdNumberService } from '../herd-number/herd-number.service';
import { BreedingController } from './breeding.controller';
import { BreedingService } from './breeding.service';

@Module({
  imports: [AuditModule],
  controllers: [BreedingController],
  providers: [BreedingService, HerdNumberService],
  exports: [BreedingService],
})
export class BreedingModule {}
