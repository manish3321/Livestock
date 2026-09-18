import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { HerdNumberService } from '../herd-number/herd-number.service';
import { ProfitModule } from '../profit/profit.module';
import { BreedingController } from './breeding.controller';
import { BreedingService } from './breeding.service';
import { BreedingBoardService } from './breeding-board.service';
import { ReproStageService } from './repro-stage.service';
import { ReminderEngineService } from './reminder-engine.service';
import { BreedingWatchService } from './breeding-watch.service';

@Module({
  imports: [AuditModule, ProfitModule],
  controllers: [BreedingController],
  providers: [BreedingService, BreedingBoardService, HerdNumberService, ReproStageService, ReminderEngineService, BreedingWatchService],
  exports: [BreedingService, BreedingBoardService, ReproStageService, ReminderEngineService, BreedingWatchService],
})
export class BreedingModule {}
