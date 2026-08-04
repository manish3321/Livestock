import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AnimalApplier } from './animal.applier';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
  imports: [AuditModule],
  controllers: [SyncController],
  providers: [SyncService, AnimalApplier],
})
export class SyncModule {}
