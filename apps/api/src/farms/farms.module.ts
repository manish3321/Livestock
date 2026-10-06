import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { FarmMembersService } from './farm-members.service';
import { FarmsController } from './farms.controller';

@Module({
  imports: [AuditModule],
  controllers: [FarmsController],
  providers: [FarmMembersService],
})
export class FarmsModule {}
