import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { HerdNumberService } from '../herd-number/herd-number.service';
import { ProfitModule } from '../profit/profit.module';
import { BreedingModule } from '../breeding/breeding.module';
import { AnimalsController } from './animals.controller';
import { AnimalsService } from './animals.service';
import { MarkersController } from './markers.controller';
import { TagsController } from './tags.controller';

@Module({
  imports: [AuditModule, ProfitModule, BreedingModule],
  controllers: [AnimalsController, MarkersController, TagsController],
  providers: [AnimalsService, HerdNumberService],
  exports: [AnimalsService],
})
export class AnimalsModule {}
