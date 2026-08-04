import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { BreedingController } from './breeding.controller';
import { BreedingService } from './breeding.service';

@Module({
  imports: [AuditModule],
  controllers: [BreedingController],
  providers: [BreedingService],
  exports: [BreedingService],
})
export class BreedingModule {}
